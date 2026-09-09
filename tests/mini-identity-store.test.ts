// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { MiniIdentityError, MiniIdentityStore, sha256 } from '../server/mini-identity-store';

const resources: Array<{ store?: MiniIdentityStore; directory: string }> = [];

async function setup(options: { now?: () => number; maxActiveSessions?: number; sessionTtlMs?: number; revokedRetentionMs?: number; codeRetentionMs?: number; randomToken?: () => string } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-mini-identity-'));
  const path = join(directory, 'auth.sqlite');
  const store = new MiniIdentityStore({ path, ...options });
  resources.push({ store, directory });
  return { store, path, directory };
}

afterEach(async () => {
  const pending = resources.splice(0);
  for (const resource of pending) resource.store?.close();
  for (const directory of new Set(pending.map(resource => resource.directory))) await rm(directory, { recursive: true, force: true });
});

describe('小程序最小身份 SQLite 仓储', () => {
  it('真实 schema 1 迁移保留原身份与 token，并在正式登录时接管', async () => {
    const { store, path, directory } = await setup();
    const old = store.issueSession('wx-migration', 'legacy-openid');
    store.close();
    resources.find(item => item.store === store)!.store = undefined;
    const database = new DatabaseSync(path);
    for (const table of ['social_daily_metrics', 'social_events', 'social_operations', 'flower_ledger', 'flower_accounts', 'comment_audit', 'comment_reports', 'article_comments', 'author_follows', 'article_collections', 'article_likes', 'publication_audience_consents', 'public_authors', 'publication_audit', 'publication_operations', 'publication_submissions', 'publication_assets', 'publication_articles', 'username_claims', 'username_sequence']) database.exec('DROP TABLE ' + table);
    database.exec('DROP TABLE cloud_operations; DROP TABLE cloud_works; DROP TABLE mini_accounts; ALTER TABLE mini_sessions DROP COLUMN kind; ALTER TABLE mini_sessions DROP COLUMN revoked_reason; PRAGMA user_version=1;');
    database.close();
    const migrated = new MiniIdentityStore({ path });
    resources.push({ store: migrated, directory });
    expect(migrated.authenticate(old.token).userId).toBe(old.userId);
    const current = migrated.issueSession('wx-migration', 'legacy-openid', 'account');
    expect(current.userId).toBe(old.userId);
    expect(() => migrated.authenticate(old.token)).toThrow();
    expect(() => migrated.issueSession('wx-migration', 'legacy-openid')).toThrow('account_upgrade_required');
  });
  it('迁移文件库、启用 WAL 并分表保存账号与私有作品', async () => {
    const { store, path, directory } = await setup();
    expect(store.statistics()).toMatchObject({ users: 0, identities: 0, sessions: 0, usedCodes: 0, journalMode: 'wal', schemaVersion: 4 });
    store.assertIntegrity();
    store.close();

    const database = new DatabaseSync(path, { readOnly: true });
    try {
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => String(row.name));
      expect(tables).toEqual(['article_collections', 'article_comments', 'article_likes', 'author_follows', 'cloud_operations', 'cloud_works',
        'comment_audit', 'comment_reports', 'flower_accounts', 'flower_ledger', 'mini_accounts', 'mini_sessions', 'public_authors',
        'publication_articles', 'publication_assets', 'publication_audience_consents', 'publication_audit', 'publication_operations', 'publication_submissions',
        'social_daily_metrics', 'social_events', 'social_operations', 'used_wechat_codes', 'username_claims', 'username_sequence', 'users', 'wechat_identities']);
      const columns = tables.flatMap(table => database.prepare(`PRAGMA table_info(${table})`).all().map(row => String(row.name)));
      expect(columns).not.toContain('phone');
      expect(columns).not.toContain('audio');
      const identityColumns = database.prepare('PRAGMA table_info(wechat_identities)').all().map(row => String(row.name));
      expect(identityColumns).not.toContain('snapshot');
    } finally { database.close(); }

    const reopened = new MiniIdentityStore({ path });
    resources.push({ store: reopened, directory });
    expect(reopened.statistics().schemaVersion).toBe(4);
  });

  it('原子消费 code 哈希、复用内部用户并只保存业务 token 哈希', async () => {
    let tokenNumber = 0;
    const { store, path } = await setup({ randomToken: () => `session_${++tokenNumber}`.padEnd(43, 'x') });
    const codeHash = sha256('one-use-code');
    store.consumeWechatCode(codeHash);
    expect(() => store.consumeWechatCode(codeHash)).toThrowError(expect.objectContaining<Partial<MiniIdentityError>>({ category: 'replayed_code' }));

    const first = store.issueSession('wx-test-domain', 'openid-one');
    const second = store.issueSession('wx-test-domain', 'openid-one');
    expect(first.userId).toBe(second.userId);
    expect(store.statistics()).toMatchObject({ users: 1, identities: 1, sessions: 2, usedCodes: 1 });
    expect(store.authenticate(second.token).userId).toBe(second.userId);

    const database = new DatabaseSync(path, { readOnly: true });
    const rows = database.prepare('SELECT token_hash FROM mini_sessions ORDER BY created_at').all() as Array<{ token_hash: string }>;
    expect(rows.map(row => row.token_hash)).toContain(sha256(first.token));
    expect(JSON.stringify(rows)).not.toContain(first.token);
    database.close();
  });

  it('限制每个用户的活动会话并统一拒绝过期或撤销 token', async () => {
    let now = 1_000_000;
    let tokenNumber = 0;
    const { store } = await setup({ now: () => now, maxActiveSessions: 2, sessionTtlMs: 1000, randomToken: () => `session_${++tokenNumber}`.padEnd(43, 'x') });
    const first = store.issueSession('wx-test-domain', 'openid-one');
    now += 1;
    const second = store.issueSession('wx-test-domain', 'openid-one');
    now += 1;
    const third = store.issueSession('wx-test-domain', 'openid-one');
    expect(() => store.authenticate(first.token)).toThrowError(expect.objectContaining<Partial<MiniIdentityError>>({ category: 'invalid_session' }));
    expect(store.authenticate(second.token).userId).toBe(second.userId);
    store.revoke(second.token);
    expect(() => store.authenticate(second.token)).toThrowError(expect.objectContaining<Partial<MiniIdentityError>>({ category: 'invalid_session' }));
    now = third.expiresAt;
    expect(() => store.authenticate(third.token)).toThrowError(expect.objectContaining<Partial<MiniIdentityError>>({ category: 'invalid_session' }));
  });

  it('清理失效记录，且会话唯一约束失败时回滚新身份', async () => {
    let now = 10_000;
    const duplicateToken = 'duplicate_session'.padEnd(43, 'x');
    const { store } = await setup({ now: () => now, sessionTtlMs: 100, revokedRetentionMs: 10, codeRetentionMs: 20, randomToken: () => duplicateToken });
    store.consumeWechatCode(sha256('old-code'));
    store.issueSession('wx-test-domain', 'openid-one');
    expect(() => store.issueSession('wx-test-domain', 'openid-two')).toThrow(/UNIQUE constraint failed/);
    expect(store.statistics()).toMatchObject({ users: 1, identities: 1, sessions: 1 });
    now += 100;
    expect(store.cleanup()).toEqual({ sessions: 1, codes: 1 });
    expect(store.statistics()).toMatchObject({ sessions: 0, usedCodes: 0 });
  });
});
