import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { hasContent, normalizeDraft, normalizeWork, workFromDraft, type Draft, type Recovery, type Work } from '../domain/writing';
import { asImportedCopy, parseBackupBundle } from './backup';
import { articleSessionSchema, copySession, type ArticleSession } from '../domain/article-ai';

interface WritingDB extends DBSchema {
  works: { key: string; value: Work };
  recovery: { key: string; value: Recovery };
  articleSessions: { key: string; value: ArticleSession };
}
export class ConflictError extends Error {
  constructor() { super('作品已在另一个页面中改变。请先导出当前内容，再重新打开，避免覆盖。'); }
}
export interface WorkRepository {
  load(): Promise<{ works: Work[]; recovery: Recovery | null; sessions?: ArticleSession[] }>;
  save(draft: Draft, expected: number, session?: ArticleSession): Promise<Work | null>;
  clearRecovery(id: string): Promise<void>;
  setDeleted(id: string, deleted: boolean, expected: number): Promise<void>;
  importBackup(raw: string): Promise<number>;
}
export class IndexedWorkRepository implements WorkRepository {
  private connection?: Promise<IDBPDatabase<WritingDB>>;
  constructor(private readonly name = 'suiyue-yousheng') {}
  private db() {
    if (!this.connection) {
      this.connection = openDB<WritingDB>(this.name, 3, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) { db.createObjectStore('works', { keyPath: 'id' }); db.createObjectStore('recovery'); }
          if (oldVersion < 2) db.createObjectStore('articleSessions', { keyPath: 'workId' });
          // v3 adds optional topic/material fields inside existing records. They
          // are normalized lazily and persisted on the next ordinary save.
        },
        blocking: () => { void this.connection?.then(db => db.close()); this.connection = undefined; },
        terminated: () => { this.connection = undefined; },
      }).catch(error => { this.connection = undefined; throw error; });
    }
    return this.connection;
  }
  async load() {
    const db = await this.db();
    const tx = db.transaction(['works', 'recovery', 'articleSessions'], 'readonly');
    const works = (await tx.objectStore('works').getAll()).map(normalizeWork);
    let recovery = await tx.objectStore('recovery').get('active') ?? null;
    if (recovery) recovery = { ...recovery, draft: normalizeDraft(recovery.draft) };
    const sessions = await tx.objectStore('articleSessions').getAll();
    await tx.done;
    const recoveryId = recovery?.draft.id;
    if (works.some(w => w.id === recoveryId && w.deletedAt)) recovery = null;
    return { works: works.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), recovery, sessions };
  }
  async save(draft: Draft, expected: number, session?: ArticleSession) {
    if (session && (session.workId !== draft.id || !articleSessionSchema.safeParse(session).success)) throw new Error('会话记录无效，原作品未改变');
    const db = await this.db();
    const tx = db.transaction(['works', 'recovery', 'articleSessions'], 'readwrite');
    const stored = await tx.objectStore('works').get(draft.id);
    const current = stored ? normalizeWork(stored) : undefined;
    if ((current?.revision ?? 0) !== expected || current?.deletedAt) {
      tx.abort(); await tx.done.catch(() => {}); throw new ConflictError();
    }
    const next = !current && !hasContent(draft) ? null : workFromDraft(draft, current);
    if (next) await tx.objectStore('works').put(next);
    if (next && session) await tx.objectStore('articleSessions').put(session);
    await tx.objectStore('recovery').put({ draft: structuredClone(draft), revision: next?.revision ?? 0 }, 'active');
    await tx.done;
    return next;
  }
  async clearRecovery(id: string) {
    const db = await this.db();
    const tx = db.transaction('recovery', 'readwrite');
    if ((await tx.store.get('active'))?.draft.id === id) await tx.store.delete('active');
    await tx.done;
  }
  async setDeleted(id: string, deleted: boolean, expected: number) {
    const db = await this.db();
    const tx = db.transaction(['works', 'recovery'], 'readwrite');
    const stored = await tx.objectStore('works').get(id);
    const work = stored ? normalizeWork(stored) : undefined;
    if (!work || work.revision !== expected) { tx.abort(); await tx.done.catch(() => {}); throw new ConflictError(); }
    const now = new Date().toISOString();
    await tx.objectStore('works').put({ ...work, deletedAt: deleted ? now : null, updatedAt: now, revision: work.revision + 1 });
    if (deleted && (await tx.objectStore('recovery').get('active'))?.draft.id === id) await tx.objectStore('recovery').delete('active');
    await tx.done;
  }
  async importBackup(raw: string) {
    const source = parseBackupBundle(raw);
    const copies = source.works.map(asImportedCopy);
    const workIds = new Map(source.works.map((work, i) => [work.id, copies[i].id]));
    const sessions = source.sessions.map(session => copySession(session, workIds.get(session.workId)!));
    const db = await this.db();
    const tx = db.transaction(['works', 'articleSessions'], 'readwrite');
    for (const copy of copies) await tx.objectStore('works').add(copy);
    for (const session of sessions) await tx.objectStore('articleSessions').add(session);
    await tx.done;
    return copies.length;
  }
  async close() { if (this.connection) (await this.connection).close(); this.connection = undefined; }
}

/** A single writer per workspace; failed writes do not advance the expected revision. */
export class DraftWriter {
  private tail: Promise<unknown> = Promise.resolve();
  private revisions = new Map<string, number>();
  constructor(private repository: WorkRepository) {}
  seed(id: string, revision: number) { this.revisions.set(id, revision); }
  write(draft: Draft, session?: ArticleSession) {
    const snapshot = structuredClone(draft);
    const sessionSnapshot = session ? structuredClone(session) : undefined;
    const job = this.tail.catch(() => {}).then(async () => {
      const next = await this.repository.save(snapshot, this.revisions.get(snapshot.id) ?? 0, sessionSnapshot);
      this.revisions.set(snapshot.id, next?.revision ?? 0);
      return next;
    });
    this.tail = job;
    return job;
  }
  async flush() { await this.tail; }
}
