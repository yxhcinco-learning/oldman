import { aggregateSchema, LOCAL_SCHEMA_VERSION, recoveryRecordSchema, repositoryIndexSchema,
  type RecoveryRecord, type RepositoryIndex, type WorkAggregate } from './schema';
import { MiniStorageError, storageError, type StorageErrorCategory } from './errors';
import { repositoryPaths, workFileName, workFilePath, workIdFromFileName, type RepositoryPaths } from './paths';
import type { LocalFileSystem } from './file-system';
import { articleSessionSchema, asImportedCopy, copySession, hasContent, makeBackup, parseBackupBundle,
  workFromDraft, type ArticleSession, type Draft, type Recovery, type Work } from '../domain/core';

export interface RepositoryIssue {
  category: StorageErrorCategory;
  message: string;
  fileName?: string;
}

export interface RepositorySnapshot {
  works: Work[];
  sessions: ArticleSession[];
  recovery: Recovery | null;
  recoverySession: ArticleSession | null;
  issues: RepositoryIssue[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const zodParseContext = { jitless: true } as const;

export class MiniWorkRepository {
  readonly paths: RepositoryPaths;
  private tail: Promise<unknown> = Promise.resolve();
  private initialization?: Promise<void>;
  private issues: RepositoryIssue[] = [];
  private quarantineCounter = 0;

  constructor(private readonly files: LocalFileSystem, userDataPath: string, private readonly now = () => new Date()) {
    this.paths = repositoryPaths(userDataPath);
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const job = this.tail.catch(() => undefined).then(work);
    this.tail = job;
    return job;
  }

  async flush() {
    await this.tail;
  }

  private async initialize() {
    if (!this.initialization) {
      this.initialization = (async () => {
        await this.files.ensureDirectory(this.paths.root);
        await this.files.ensureDirectory(this.paths.works);
        await this.files.ensureDirectory(this.paths.quarantine);
        const previousIds = await this.readPreviousIndex();
        await this.recoverInterruptedReplacements();
        const rebuilt = await this.rebuildIndex();
        if (previousIds) {
          const availableIds = new Set(rebuilt.entries.map(entry => entry.id));
          for (const id of previousIds) {
            if (!availableIds.has(id)) this.issues.push({ category: 'missing', message: '一份本地作品文件不存在，可能已被系统清理。', fileName: workFileName(id) });
          }
        }
      })().catch(error => {
        this.initialization = undefined;
        throw storageError(error);
      });
    }
    await this.initialization;
  }

  private parseAggregate(raw: string): WorkAggregate {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new MiniStorageError('corrupt'); }
    const result = aggregateSchema.safeParse(value, zodParseContext);
    if (!result.success) throw new MiniStorageError('corrupt');
    return result.data as WorkAggregate;
  }

  private async readAggregate(id: string): Promise<WorkAggregate | null> {
    const path = workFilePath(this.paths, id);
    if (!await this.files.exists(path)) return null;
    try { return this.parseAggregate(await this.files.readText(path)); }
    catch (error) { throw storageError(error, 'corrupt'); }
  }

  private async safeRemove(path: string) {
    if (await this.files.exists(path)) await this.files.remove(path);
  }

  private async quarantine(path: string, fileName: string) {
    if (!await this.files.exists(path)) return;
    const stamp = this.now().getTime();
    const target = `${this.paths.quarantine}/${fileName}.corrupt-${stamp}-${this.quarantineCounter++}`;
    try { await this.files.rename(path, target); }
    catch (error) { this.issues.push({ category: storageError(error).category, message: '损坏文件暂时无法隔离。', fileName }); }
  }

  private async validAggregate(path: string) {
    if (!await this.files.exists(path)) return false;
    try { this.parseAggregate(await this.files.readText(path)); return true; }
    catch { return false; }
  }

  private async recoverInterruptedReplacements() {
    const names = await this.files.list(this.paths.works);
    const bases = new Set<string>();
    for (const name of names) {
      const base = name.replace(/\.(?:tmp|bak)$/, '');
      if (workIdFromFileName(base)) bases.add(base);
    }
    for (const base of bases) {
      const target = `${this.paths.works}/${base}`;
      const temporary = `${target}.tmp`;
      const backup = `${target}.bak`;
      if (await this.validAggregate(target)) {
        await this.safeRemove(temporary).catch(() => undefined);
        await this.safeRemove(backup).catch(() => undefined);
        continue;
      }
      if (await this.validAggregate(temporary)) {
        await this.quarantine(target, base);
        await this.files.rename(temporary, target);
        await this.safeRemove(backup).catch(() => undefined);
        this.issues.push({ category: 'corrupt', message: '已从完整的临时文件恢复作品。', fileName: base });
        continue;
      }
      if (await this.validAggregate(backup)) {
        await this.quarantine(target, base);
        await this.files.rename(backup, target);
        await this.safeRemove(temporary).catch(() => undefined);
        this.issues.push({ category: 'corrupt', message: '已从替换前副本恢复作品。', fileName: base });
        continue;
      }
      await this.quarantine(target, base);
      await this.quarantine(temporary, `${base}.tmp`);
      await this.quarantine(backup, `${base}.bak`);
      this.issues.push({ category: 'corrupt', message: '一份无法恢复的作品文件已隔离。', fileName: base });
    }
  }

  private async replaceValidated(path: string, raw: string, validate: (value: string) => unknown) {
    const temporary = `${path}.tmp`;
    const backup = `${path}.bak`;
    let movedOriginal = false;
    try {
      await this.safeRemove(temporary);
      await this.files.writeText(temporary, raw);
      validate(await this.files.readText(temporary));
      await this.safeRemove(backup);
      if (await this.files.exists(path)) {
        await this.files.rename(path, backup);
        movedOriginal = true;
      }
      await this.files.rename(temporary, path);
      validate(await this.files.readText(path));
      await this.safeRemove(backup);
    } catch (error) {
      try {
        if (movedOriginal && await this.files.exists(backup)) {
          await this.safeRemove(path);
          await this.files.rename(backup, path);
        }
        await this.safeRemove(temporary);
      } catch { /* Preserve the sidecar for startup recovery. */ }
      throw storageError(error);
    }
  }

  private async writeAggregate(aggregate: WorkAggregate) {
    const parsed = aggregateSchema.parse(aggregate, zodParseContext) as WorkAggregate;
    const path = workFilePath(this.paths, parsed.work.id);
    await this.replaceValidated(path, JSON.stringify(parsed), raw => this.parseAggregate(raw));
  }

  private async writeSmallFile(path: string, value: unknown, validate: (value: unknown) => unknown) {
    await this.replaceValidated(path, JSON.stringify(value), raw => validate(JSON.parse(raw)));
  }

  private async readPreviousIndex(): Promise<Set<string> | null> {
    if (!await this.files.exists(this.paths.index)) return null;
    try {
      const index = repositoryIndexSchema.parse(JSON.parse(await this.files.readText(this.paths.index)), zodParseContext);
      return new Set(index.entries.map(entry => entry.id));
    } catch {
      await this.quarantine(this.paths.index, 'index.json');
      this.issues.push({ category: 'corrupt', message: '本地作品索引已损坏，已根据作品文件重建。', fileName: 'index.json' });
      return null;
    }
  }

  private async rebuildIndex(): Promise<RepositoryIndex> {
    const entries: RepositoryIndex['entries'] = [];
    for (const fileName of await this.files.list(this.paths.works)) {
      const id = workIdFromFileName(fileName);
      if (!id) continue;
      const path = `${this.paths.works}/${fileName}`;
      try {
        const aggregate = this.parseAggregate(await this.files.readText(path));
        if (aggregate.work.id !== id) throw new MiniStorageError('corrupt');
        entries.push({ id, fileName, title: aggregate.work.title, updatedAt: aggregate.work.updatedAt,
          revision: aggregate.work.revision, deletedAt: aggregate.work.deletedAt });
      } catch {
        await this.quarantine(path, fileName);
        this.issues.push({ category: 'corrupt', message: '一份损坏的作品已隔离，其他作品仍可使用。', fileName });
      }
    }
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const index: RepositoryIndex = { schemaVersion: LOCAL_SCHEMA_VERSION, generatedAt: this.now().toISOString(), entries };
    await this.writeSmallFile(this.paths.index, index, value => repositoryIndexSchema.parse(value, zodParseContext));
    return index;
  }

  private async loadRecovery(aggregates: WorkAggregate[]): Promise<{ recovery: Recovery | null; session: ArticleSession | null }> {
    if (!await this.files.exists(this.paths.recovery)) return { recovery: null, session: null };
    let record: RecoveryRecord;
    try { record = recoveryRecordSchema.parse(JSON.parse(await this.files.readText(this.paths.recovery)), zodParseContext); }
    catch {
      await this.quarantine(this.paths.recovery, 'active-recovery.json');
      this.issues.push({ category: 'corrupt', message: '未完成编辑的恢复记录已损坏，已保留已保存作品。' });
      return { recovery: null, session: null };
    }
    const aggregate = aggregates.find(item => item.work.id === record.workId);
    const diskRevision = aggregate?.work.revision ?? 0;
    const isNewer = !aggregate?.work.deletedAt && record.expectedRevision === diskRevision && record.recoveryRevision > diskRevision;
    if (!isNewer) {
      await this.safeRemove(this.paths.recovery).catch(() => undefined);
      return { recovery: null, session: null };
    }
    return { recovery: { draft: record.draft, revision: record.expectedRevision }, session: record.session };
  }

  async load(): Promise<RepositorySnapshot> {
    await this.initialize();
    const index = await this.rebuildIndex();
    const aggregates: WorkAggregate[] = [];
    for (const entry of index.entries) {
      const aggregate = await this.readAggregate(entry.id);
      if (aggregate) aggregates.push(aggregate);
    }
    const recovered = await this.loadRecovery(aggregates);
    const result = { works: aggregates.map(item => item.work), sessions: aggregates.flatMap(item => item.session ? [item.session] : []),
      recovery: recovered.recovery, recoverySession: recovered.session, issues: [...this.issues] };
    this.issues = [];
    return result;
  }

  save(draft: Draft, expectedRevision: number, session?: ArticleSession): Promise<Work | null> {
    const draftSnapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : undefined;
    return this.enqueue(async () => {
      await this.initialize();
      if (sessionSnapshot && (sessionSnapshot.workId !== draftSnapshot.id || !articleSessionSchema.safeParse(sessionSnapshot, zodParseContext).success)) {
        throw new MiniStorageError('invalid', { message: '会话记录无效，原作品未改变。' });
      }
      const current = await this.readAggregate(draftSnapshot.id);
      if ((current?.work.revision ?? 0) !== expectedRevision || current?.work.deletedAt) throw new MiniStorageError('conflict');
      if (!current && !hasContent(draftSnapshot)) return null;
      const work = workFromDraft(draftSnapshot, current?.work);
      const aggregate: WorkAggregate = { app: 'suiyue-yousheng', schemaVersion: LOCAL_SCHEMA_VERSION,
        savedAt: this.now().toISOString(), work, session: sessionSnapshot ?? current?.session ?? null };
      await this.writeAggregate(aggregate);
      await this.rebuildIndex();
      await this.clearRecoveryInternal(draftSnapshot.id);
      return work;
    });
  }

  writeRecovery(draft: Draft, expectedRevision: number, session?: ArticleSession): Promise<void> {
    const snapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : null;
    return this.enqueue(async () => {
      await this.initialize();
      if (sessionSnapshot && (sessionSnapshot.workId !== snapshot.id || !articleSessionSchema.safeParse(sessionSnapshot, zodParseContext).success)) {
        throw new MiniStorageError('invalid');
      }
      const record: RecoveryRecord = { schemaVersion: LOCAL_SCHEMA_VERSION, workId: snapshot.id, expectedRevision,
        recoveryRevision: expectedRevision + 1, updatedAt: this.now().toISOString(), draft: snapshot, session: sessionSnapshot };
      await this.writeSmallFile(this.paths.recovery, record, value => recoveryRecordSchema.parse(value, zodParseContext));
    });
  }

  private async clearRecoveryInternal(id: string) {
    if (!await this.files.exists(this.paths.recovery)) return;
    try {
      const record = recoveryRecordSchema.parse(JSON.parse(await this.files.readText(this.paths.recovery)), zodParseContext);
      if (record.workId === id) await this.files.remove(this.paths.recovery);
    } catch { /* load() will isolate an invalid recovery record. */ }
  }

  clearRecovery(id: string): Promise<void> {
    return this.enqueue(async () => { await this.initialize(); await this.clearRecoveryInternal(id); });
  }

  setDeleted(id: string, deleted: boolean, expectedRevision: number): Promise<Work> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(id);
      if (!current || current.work.revision !== expectedRevision) throw new MiniStorageError('conflict');
      const updatedAt = this.now().toISOString();
      const work: Work = { ...current.work, deletedAt: deleted ? updatedAt : null, updatedAt, revision: current.work.revision + 1 };
      await this.writeAggregate({ ...current, savedAt: updatedAt, work });
      await this.rebuildIndex();
      if (deleted) await this.clearRecoveryInternal(id);
      return work;
    });
  }

  permanentlyDelete(id: string, expectedRevision: number): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(id);
      if (!current || current.work.revision !== expectedRevision || !current.work.deletedAt) throw new MiniStorageError('conflict');
      const target = workFilePath(this.paths, id);
      const tombstone = `${target}.delete`;
      await this.safeRemove(tombstone);
      await this.files.rename(target, tombstone);
      try {
        await this.rebuildIndex();
        await this.files.remove(tombstone);
      } catch (error) {
        if (await this.files.exists(tombstone)) await this.files.rename(tombstone, target);
        await this.rebuildIndex().catch(() => undefined);
        throw storageError(error);
      }
    });
  }

  async exportBackup(): Promise<string> {
    const snapshot = await this.load();
    return makeBackup(snapshot.works, snapshot.recovery?.draft ?? null, snapshot.sessions);
  }

  rescueExport(draft: Draft, works: Work[] = [], sessions: ArticleSession[] = []) {
    return makeBackup(works, draft, sessions);
  }

  importBackup(raw: string): Promise<number> {
    const source = parseBackupBundle(raw);
    const copies = source.works.map(asImportedCopy);
    const workIds = new Map(source.works.map((work, index) => [work.id, copies[index]!.id]));
    const sessions = source.sessions.map(session => copySession(session, workIds.get(session.workId)!));
    const sessionByWork = new Map(sessions.map(session => [session.workId, session]));
    const aggregates = copies.map(work => aggregateSchema.parse({ app: 'suiyue-yousheng', schemaVersion: LOCAL_SCHEMA_VERSION,
      savedAt: this.now().toISOString(), work, session: sessionByWork.get(work.id) ?? null }, zodParseContext) as WorkAggregate);
    return this.enqueue(async () => {
      await this.initialize();
      const created: string[] = [];
      try {
        for (const aggregate of aggregates) {
          if (await this.readAggregate(aggregate.work.id)) throw new MiniStorageError('conflict');
          await this.writeAggregate(aggregate);
          created.push(aggregate.work.id);
        }
        await this.rebuildIndex();
        return created.length;
      } catch (error) {
        for (const id of created) await this.safeRemove(workFilePath(this.paths, id)).catch(() => undefined);
        await this.rebuildIndex().catch(() => undefined);
        throw storageError(error, error instanceof MiniStorageError ? error.category : 'system');
      }
    });
  }
}

export class MiniDraftWriter {
  private tail: Promise<unknown> = Promise.resolve();
  private revisions = new Map<string, number>();

  constructor(private readonly repository: MiniWorkRepository) {}

  seed(id: string, revision: number) {
    this.revisions.set(id, revision);
  }

  write(draft: Draft, session?: ArticleSession) {
    const snapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : undefined;
    const job = this.tail.catch(() => undefined).then(async () => {
      const next = await this.repository.save(snapshot, this.revisions.get(snapshot.id) ?? 0, sessionSnapshot);
      this.revisions.set(snapshot.id, next?.revision ?? 0);
      return next;
    });
    this.tail = job;
    return job;
  }

  async preserve(draft: Draft, session?: ArticleSession) {
    await this.repository.writeRecovery(draft, this.revisions.get(draft.id) ?? 0, session);
  }

  updateLatestSession(id: string, update: (session: ArticleSession) => ArticleSession) {
    const job = this.tail.catch(() => undefined).then(async () => {
      const snapshot = await this.repository.load();
      const recovery = snapshot.recovery?.draft.id === id ? snapshot.recovery : null;
      const stored = snapshot.works.find(work => work.id === id && !work.deletedAt) ?? null;
      const draft = recovery?.draft ?? stored?.draft;
      const session = recovery ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id);
      if (!draft || !session) throw new MiniStorageError('missing', { message: '当前文章会话已不存在。' });
      const revision = recovery?.revision ?? stored?.revision ?? 0;
      this.revisions.set(id, revision);
      const nextSession = update(clone(session));
      const work = await this.repository.save(clone(draft), revision, clone(nextSession));
      this.revisions.set(id, work?.revision ?? 0);
      return { draft, session: nextSession, work };
    });
    this.tail = job;
    return job;
  }

  async flush() {
    await this.tail;
    await this.repository.flush();
  }
}
