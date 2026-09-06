import type { DatabaseSync } from 'node:sqlite';
import { cloudMutationSchema, stableJson, workSnapshotSchema, type CloudChanges, type CloudMutation, type CloudMutationResult,
  type CloudWork, type CloudWorkEntry, type WorkSnapshot } from '../packages/core/src/cloud-protocol';
import { MiniIdentityStore, sha256 } from './mini-identity-store';
import { revokeWorkPublication } from './publication-lifecycle';

export class CloudWorkError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'CloudWorkError'; }
}
export interface CloudWorkLimits { maxWorkBytes: number; maxAccountBytes: number; maxWorks: number }
export const DEFAULT_CLOUD_LIMITS: CloudWorkLimits = { maxWorkBytes: 8 * 1024 * 1024, maxAccountBytes: 100 * 1024 * 1024, maxWorks: 1000 };
interface WorkRow {
  id: string; version: number; sequence: number; title: string; updated_at: string; deleted_at: string | null;
  purged: number; snapshot: string | null; bytes: number;
}
const entryOf = (row: WorkRow): CloudWorkEntry => ({ id: row.id, version: row.version, sequence: row.sequence, title: row.title,
  updatedAt: row.updated_at, deletedAt: row.deleted_at, purged: Boolean(row.purged) });
const missing = () => new CloudWorkError(404, 'work_not_found', '这篇云作品已不存在。');

export class CloudWorkStore {
  readonly limits: CloudWorkLimits;
  constructor(private readonly identity: MiniIdentityStore, limits: Partial<CloudWorkLimits> = {}, private readonly now = Date.now) {
    this.limits = { ...DEFAULT_CLOUD_LIMITS, ...limits };
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value < 1) || this.limits.maxWorkBytes > 8 * 1024 * 1024) {
      throw new Error('Invalid cloud work limits');
    }
  }

  changes(token: string, cursor: number): CloudChanges {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new CloudWorkError(400, 'invalid_cursor', '作品列表请求无效。');
    return this.identity.accountTransaction(token, (database, session) => {
      const rows = database.prepare('SELECT * FROM cloud_works WHERE user_id = ? AND sequence > ? ORDER BY sequence LIMIT 101')
        .all(session.userId, cursor) as unknown as WorkRow[];
      const page = rows.slice(0, 100);
      return { entries: page.map(entryOf), cursor: page.at(-1)?.sequence ?? cursor, hasMore: rows.length > 100 };
    });
  }

  get(token: string, id: string): CloudWork {
    return this.identity.accountTransaction(token, (database, session) => {
      const row = this.row(database, session.userId, id);
      if (!row) throw missing();
      return { ...entryOf(row), snapshot: row.snapshot ? workSnapshotSchema.parse(JSON.parse(row.snapshot), { jitless: true }) : null };
    });
  }

  private row(database: DatabaseSync, userId: string, id: string) {
    return database.prepare('SELECT * FROM cloud_works WHERE user_id = ? AND id = ?').get(userId, id) as WorkRow | undefined;
  }

  mutate(token: string, input: CloudMutation): CloudMutationResult {
    const parsed = cloudMutationSchema.safeParse(input, { jitless: true });
    if (!parsed.success) throw new CloudWorkError(400, 'invalid_mutation', '作品同步内容无效。');
    const mutation = parsed.data;
    const digest = sha256(stableJson(mutation));
    return this.identity.accountTransaction(token, (database, session) => {
      const userId = session.userId;
      const receipt = database.prepare('SELECT digest, result FROM cloud_operations WHERE user_id = ? AND id = ?')
        .get(userId, mutation.operationId) as { digest: string; result: string } | undefined;
      if (receipt) {
        if (receipt.digest !== digest) throw new CloudWorkError(409, 'operation_mismatch', '同步操作已存在，请重新核对云作品。');
        return JSON.parse(receipt.result) as CloudMutationResult;
      }
      const current = this.row(database, userId, mutation.workId);
      if (mutation.kind === 'create' ? Boolean(current) : !current || current.purged || current.version !== mutation.baseVersion) {
        if (!current && mutation.kind !== 'create') throw missing();
        throw new CloudWorkError(409, current?.purged ? 'work_purged' : 'version_conflict', '云作品已有变化，请先保留本机内容并取得最新版本。');
      }
      if (mutation.kind === 'save' && current?.deleted_at || mutation.kind === 'purge' && !current?.deleted_at) {
        throw new CloudWorkError(409, 'lifecycle_conflict', '作品状态已变化，请刷新后重试。');
      }
      const now = this.now();
      const updatedAt = new Date(now).toISOString();
      let snapshot: WorkSnapshot | null = mutation.snapshot ?? (current?.snapshot ? JSON.parse(current.snapshot) as WorkSnapshot : null);
      let deletedAt = current?.deleted_at ?? snapshot?.work.deletedAt ?? null;
      if (mutation.kind === 'save' && snapshot?.work.deletedAt) throw new CloudWorkError(400, 'invalid_mutation', '请通过回收站操作删除作品。');
      if (mutation.kind === 'trash') deletedAt = updatedAt;
      if (mutation.kind === 'restore') deletedAt = null;
      if (snapshot) snapshot = { ...snapshot, work: { ...snapshot.work, deletedAt } };
      if (mutation.kind === 'purge') snapshot = null;
      if (mutation.kind === 'trash' || mutation.kind === 'purge') revokeWorkPublication(database, userId, mutation.workId, mutation.kind === 'purge', updatedAt);
      const raw = snapshot ? JSON.stringify(snapshot) : null;
      const bytes = raw ? Buffer.byteLength(raw) : 0;
      const totals = database.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM cloud_works WHERE user_id = ? AND purged = 0')
        .get(userId) as { count: number; bytes: number };
      if (bytes > this.limits.maxWorkBytes || totals.bytes - (current?.bytes ?? 0) + bytes > this.limits.maxAccountBytes ||
        !current && totals.count >= this.limits.maxWorks) throw new CloudWorkError(413, 'cloud_capacity', '云端保存超过容量上限，内容仍保留在本机，请导出备份。');
      const nextSequence = database.prepare('UPDATE mini_accounts SET sequence = sequence + 1 WHERE user_id = ? RETURNING sequence').get(userId) as { sequence: number };
      const row: WorkRow = { id: mutation.workId, version: (current?.version ?? 0) + 1, sequence: nextSequence.sequence,
        title: snapshot?.work.title ?? '', updated_at: updatedAt, deleted_at: deletedAt, purged: snapshot ? 0 : 1, snapshot: raw, bytes };
      database.prepare(`INSERT INTO cloud_works (user_id,id,version,sequence,title,updated_at,deleted_at,purged,snapshot,bytes)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET version=excluded.version,sequence=excluded.sequence,title=excluded.title,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,purged=excluded.purged,snapshot=excluded.snapshot,bytes=excluded.bytes`)
        .run(userId, row.id, row.version, row.sequence, row.title, row.updated_at, row.deleted_at, row.purged, row.snapshot, row.bytes);
      // Receipts intentionally carry no private title/body. They only acknowledge a version.
      const result: CloudMutationResult = { operationId: mutation.operationId, entry: { ...entryOf(row), title: '' } };
      database.prepare('INSERT INTO cloud_operations (user_id,id,work_id,digest,result,created_at) VALUES (?,?,?,?,?,?)')
        .run(userId, mutation.operationId, mutation.workId, digest, JSON.stringify(result), now);
      return result;
    });
  }
}
