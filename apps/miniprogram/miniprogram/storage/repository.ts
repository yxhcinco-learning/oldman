import { aggregateSchema, LOCAL_SCHEMA_VERSION, recoveryRecordSchema, repositoryIndexSchema, emptyCloudMetadata,
  type RecoveryRecord, type RepositoryIndex, type WorkAggregate } from './schema';
import { MiniStorageError, storageError, type StorageErrorCategory } from './errors';
import { repositoryPaths, workFileName, workFilePath, workIdFromFileName, type RepositoryPaths } from './paths';
import type { LocalFileSystem } from './file-system';
import { articleSessionSchema, asImportedCopy, copySession, hasContent, makeBackup, makeBackupVolumes, parseBackupBundle, newId, emptyWritingState,
  workFromDraft, type ArticleSession, type Draft, type Recovery, type Work, type WritingState, type CloudMutation, type CloudMutationResult,
  type CloudWork, type WorkSnapshot, type WorkWritingState } from '../domain/core';

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
  recoveryWritingState?: WritingState;
  issues: RepositoryIssue[];
  pendingSessions: RecoveryRecord[];
  aggregates?: WorkAggregate[];
  writingStates?: WorkWritingState[];
}

export class MiniSessionSaveError extends Error {
  constructor(readonly context: { draft: Draft; session: ArticleSession; work: Work | null }, readonly durable: boolean) {
    super(durable ? '回复暂未保存到作品，已保留恢复副本。请重试保存。'
      : '回复还未保存，请先重试或导出当前内容，暂时不要关闭微信。');
    this.name = 'MiniSessionSaveError';
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stableJson = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function assertReplyPreserved(stored: ArticleSession | null | undefined, next: ArticleSession | undefined) {
  if (!stored || !next) return;
  if (stored.turns.some(turn => {
    if (!turn.result) return false;
    const incoming = next.turns.find(item => item.id === turn.id);
    return !incoming || stableJson(incoming.result) !== stableJson(turn.result)
      || Boolean(turn.appliedVersionId && (incoming.appliedVersionId !== turn.appliedVersionId || incoming.status !== turn.status))
      || Boolean(turn.revertedVersionId && incoming.revertedVersionId !== turn.revertedVersionId);
  })) throw new MiniStorageError('conflict', { message: '小文已有新的回复，旧状态未覆盖。请重新打开小文或先导出当前内容。' });
}
const zodParseContext = { jitless: true } as const;

export class MiniWorkRepository {
  readonly paths: RepositoryPaths;
  private tail: Promise<unknown> = Promise.resolve();
  private initialization?: Promise<void>;
  private issues: RepositoryIssue[] = [];
  private quarantineCounter = 0;
  private listeners = new Set<(id: string) => void>();
  subscribe(listener: (id: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  constructor(private readonly files: LocalFileSystem, userDataPath: string, private readonly now = () => new Date(), readonly accountId?: string) {
    this.paths = repositoryPaths(userDataPath, accountId);
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
        // Recover only validated reply journals, never delete an unreadable result.
        const names = await this.files.list(this.paths.root);
        for (const base of new Set(names.map(name => name.replace(/\.(tmp|bak)$/, '')).filter(name => /^[A-Za-z0-9_-]+\.result\.json$/.test(name)))) {
          const target = `${this.paths.root}/${base}`;
          const valid = async (path: string) => {
            try { return recoveryRecordSchema.safeParse(JSON.parse(await this.files.readText(path)), zodParseContext).success; } catch { return false; }
          };
          if (await valid(target)) continue;
          for (const suffix of ['.tmp', '.bak']) if (await valid(target + suffix)) {
            await this.quarantine(target, base);
            await this.files.rename(target + suffix, target);
            break;
          }
        }
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
    this.listeners.forEach(listener => listener(parsed.work.id));
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

  private async loadRecovery(aggregates: WorkAggregate[]): Promise<{ recovery: Recovery | null; session: ArticleSession | null; writingState?: WritingState }> {
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
    return { recovery: { draft: record.draft, revision: record.expectedRevision }, session: record.session, writingState: record.writingState };
  }

  load(): Promise<RepositorySnapshot> {
    // Loading also rebuilds the index and cleans journals; it is a storage transaction.
    return this.enqueue(() => this.loadInternal()).catch(error => { throw storageError(error); });
  }

  private async loadInternal(): Promise<RepositorySnapshot> {
    await this.initialize();
    const index = await this.rebuildIndex();
    const aggregates: WorkAggregate[] = [];
    for (const entry of index.entries) {
      const aggregate = await this.readAggregate(entry.id);
      if (aggregate && !aggregate.cloud?.claim) aggregates.push(aggregate);
    }
    const recovered = await this.loadRecovery(aggregates);
    const pendingSessions: RecoveryRecord[] = [];
    for (const name of await this.files.list(this.paths.root)) {
      if (!/^[A-Za-z0-9_-]+\.result\.json$/.test(name)) continue;
      try {
        const record = recoveryRecordSchema.parse(JSON.parse(await this.files.readText(`${this.paths.root}/${name}`)), zodParseContext);
        if (name !== `${record.workId}.result.json` || !record.session) throw new Error('invalid');
        const stored = aggregates.find(item => item.work.id === record.workId);
        if (stored && stableJson(stored.session) === stableJson(record.session)) {
          await this.clearPendingSessionInternal(record.workId);
        } else pendingSessions.push(record);
      } catch {
        this.issues.push({ category: 'corrupt', message: '一份小文回复恢复记录暂时无法读取，原文件仍保留。', fileName: name });
      }
    }
    const result = { works: aggregates.map(item => item.work), sessions: aggregates.flatMap(item => item.session ? [item.session] : []), aggregates,
      writingStates: aggregates.map(item => ({ workId: item.work.id, state: item.writingState ?? emptyWritingState() })),
      recovery: recovered.recovery, recoverySession: recovered.session, recoveryWritingState: recovered.writingState, pendingSessions, issues: [...this.issues] };
    this.issues = [];
    return result;
  }

  stageSession(draft: Draft, session: ArticleSession, expectedRevision: number) {
    const record: RecoveryRecord = { schemaVersion: LOCAL_SCHEMA_VERSION, workId: draft.id, draft: clone(draft), session: clone(session),
      expectedRevision, recoveryRevision: expectedRevision + 1, updatedAt: this.now().toISOString() };
    return this.enqueue(async () => {
      await this.initialize();
      workFileName(draft.id);
      await this.writeSmallFile(`${this.paths.root}/${draft.id}.result.json`, record, value => recoveryRecordSchema.parse(value, zodParseContext));
    });
  }

  clearPendingSession(id: string) {
    return this.enqueue(() => this.clearPendingSessionInternal(id));
  }

  private async clearPendingSessionInternal(id: string) {
    workFileName(id);
    await this.safeRemove(`${this.paths.root}/${id}.result.json`);
  }

  save(draft: Draft, expectedRevision: number, session?: ArticleSession, writingState?: WritingState): Promise<Work | null> {
    const draftSnapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : undefined;
    return this.enqueue(async () => {
      await this.initialize();
      if (sessionSnapshot && (sessionSnapshot.workId !== draftSnapshot.id || !articleSessionSchema.safeParse(sessionSnapshot, zodParseContext).success)) {
        throw new MiniStorageError('invalid', { message: '会话记录无效，原作品未改变。' });
      }
      const current = await this.readAggregate(draftSnapshot.id);
      if (current?.cloud?.claim) throw new MiniStorageError('conflict', { message: '作品已归属登录账号，请重新打开。' });
      assertReplyPreserved(current?.session, sessionSnapshot);
      const journalPath = `${this.paths.root}/${draftSnapshot.id}.result.json`;
      if (await this.files.exists(journalPath)) {
        const journal = recoveryRecordSchema.parse(JSON.parse(await this.files.readText(journalPath)), zodParseContext);
        if (stableJson(journal.session) !== stableJson(sessionSnapshot)) throw new MiniStorageError('conflict', { message: '请先保存已收到的小文回复，或导出当前内容。' });
      }
      // Aggregate commit may succeed before index/cleanup fails. Explicit retry is idempotent.
      if (current?.work.revision === expectedRevision + 1 && stableJson(current.work.draft) === stableJson(draftSnapshot)
        && stableJson(current.session) === stableJson(sessionSnapshot) && (!writingState || stableJson(current.writingState) === stableJson(writingState))) {
        await this.rebuildIndex();
        await this.clearRecoveryInternal(draftSnapshot.id);
        return current.work;
      }
      if ((current?.work.revision ?? 0) !== expectedRevision || current?.work.deletedAt) throw new MiniStorageError('conflict');
      if (!current && !hasContent(draftSnapshot) && !sessionSnapshot?.turns.length && !sessionSnapshot?.conversation && !writingState?.composer.trim()) return null;
      const work = workFromDraft(draftSnapshot, current?.work);
      const aggregate: WorkAggregate = { app: 'suiyue-yousheng', schemaVersion: LOCAL_SCHEMA_VERSION,
        savedAt: this.now().toISOString(), work, session: sessionSnapshot ?? current?.session ?? null,
        writingState: writingState ?? current?.writingState ?? emptyWritingState(), cloud: current?.cloud ?? emptyCloudMetadata() };
      await this.writeAggregate(aggregate);
      await this.rebuildIndex();
      await this.clearRecoveryInternal(draftSnapshot.id);
      return work;
    });
  }

  writeRecovery(draft: Draft, expectedRevision: number, session?: ArticleSession, writingState?: WritingState): Promise<void> {
    const snapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : null;
    return this.enqueue(async () => {
      await this.initialize();
      if (sessionSnapshot && (sessionSnapshot.workId !== snapshot.id || !articleSessionSchema.safeParse(sessionSnapshot, zodParseContext).success)) {
        throw new MiniStorageError('invalid');
      }
      const current = await this.readAggregate(snapshot.id);
      if ((current?.work.revision ?? 0) !== expectedRevision || current?.work.deletedAt) throw new MiniStorageError('conflict');
      assertReplyPreserved(current?.session, sessionSnapshot ?? undefined);
      const record: RecoveryRecord = { schemaVersion: LOCAL_SCHEMA_VERSION, workId: snapshot.id, expectedRevision,
        recoveryRevision: expectedRevision + 1, updatedAt: this.now().toISOString(), draft: snapshot, session: sessionSnapshot,
        ...(writingState ? { writingState } : {}) };
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
    // Unsaved replies travel as explicit rescue copies, never replace a newer work.
    const copies = snapshot.pendingSessions.map(record => asImportedCopy(workFromDraft(record.draft)));
    const rescued = snapshot.pendingSessions.flatMap((record, index) => record.session ? [copySession(record.session, copies[index]!.id)] : []);
    const sessions = snapshot.recoverySession ? [...snapshot.sessions.filter(session => session.workId !== snapshot.recoverySession!.workId), snapshot.recoverySession] : snapshot.sessions;
    const writingStates = [...snapshot.writingStates ?? []];
    if (snapshot.recovery && snapshot.recoveryWritingState) {
      const index = writingStates.findIndex(item => item.workId === snapshot.recovery!.draft.id);
      if (index >= 0) writingStates.splice(index, 1);
      writingStates.push({ workId: snapshot.recovery.draft.id, state: snapshot.recoveryWritingState });
    }
    snapshot.pendingSessions.forEach((record, index) => {
      const state = record.writingState ?? writingStates.find(item => item.workId === record.workId)?.state;
      if (state) writingStates.push({ workId: copies[index]!.id, state });
    });
    return makeBackup([...snapshot.works, ...copies], snapshot.recovery?.draft ?? null, [...sessions, ...rescued], writingStates);
  }

  async exportVolumes(): Promise<string[]> {
    // exportBackup folds recovery and pending AI results into the portable bundle first.
    const raw = JSON.parse(await this.exportBackup()) as { works: Work[]; sessions: ArticleSession[]; writingStates: WorkWritingState[] };
    return makeBackupVolumes(raw.works, raw.sessions, raw.writingStates);
  }

  rescueExport(draft: Draft, works: Work[] = [], sessions: ArticleSession[] = [], writingStates: WorkWritingState[] = []) {
    return makeBackup(works, draft, sessions, writingStates);
  }

  importBackup(raw: string): Promise<number> {
    const source = parseBackupBundle(raw);
    const copies = source.works.map(asImportedCopy);
    const workIds = new Map(source.works.map((work, index) => [work.id, copies[index]!.id]));
    const sessions = source.sessions.map(session => copySession(session, workIds.get(session.workId)!));
    const sessionByWork = new Map(sessions.map(session => [session.workId, session]));
    const stateByWork = new Map(source.writingStates.map(item => [workIds.get(item.workId), item.state]));
    const aggregates = copies.map(work => aggregateSchema.parse({ app: 'suiyue-yousheng', schemaVersion: LOCAL_SCHEMA_VERSION,
      savedAt: this.now().toISOString(), work, session: sessionByWork.get(work.id) ?? null,
      writingState: stateByWork.get(work.id) ?? emptyWritingState() }, zodParseContext) as WorkAggregate);
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

  allAggregates(includeClaimed = false): Promise<WorkAggregate[]> {
    return this.enqueue(() => this.readAllAggregates(includeClaimed)).catch(error => { throw storageError(error); });
  }

  private async readAllAggregates(includeClaimed: boolean): Promise<WorkAggregate[]> {
    await this.initialize();
    const values: WorkAggregate[] = [];
    for (const name of await this.files.list(this.paths.works)) {
      const id = workIdFromFileName(name);
      if (!id) continue;
      const aggregate = await this.readAggregate(id);
      if (aggregate && (includeClaimed || !aggregate.cloud?.claim)) values.push(aggregate);
    }
    return values;
  }

  getAggregate(id: string): Promise<WorkAggregate | null> {
    return this.enqueue(async () => { await this.initialize(); return this.readAggregate(id); });
  }

  private snapshotOf(aggregate: WorkAggregate): WorkSnapshot {
    return { work: aggregate.work, session: aggregate.session, writingState: aggregate.writingState ?? emptyWritingState() };
  }

  queueMutation(id: string, kind?: CloudMutation['kind']): Promise<CloudMutation | null> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(id);
      if (!current) throw new MiniStorageError('missing');
      const cloud = current.cloud ?? emptyCloudMetadata();
      if (cloud.recoveryOf || cloud.claim) return null;
      if (cloud.operation) return clone(cloud.operation);
      if (!kind && cloud.version > 0 && cloud.syncedRevision === current.work.revision) return null;
      const selectedKind = kind ?? (cloud.version ? 'save' : 'create');
      const operation: CloudMutation = { operationId: newId(), workId: id, kind: selectedKind, baseVersion: cloud.version,
        ...(['create', 'save'].includes(selectedKind) ? { snapshot: this.snapshotOf(current) } : {}) };
      await this.writeAggregate({ ...current, cloud: { ...cloud, operation, operationRevision: current.work.revision } });
      return clone(operation);
    });
  }

  acknowledge(id: string, result: CloudMutationResult): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(id);
      if (!current?.cloud?.operation || current.cloud.operation.operationId !== result.operationId) return;
      if (result.entry.id !== id || result.entry.version !== current.cloud.operation.baseVersion + 1) throw new MiniStorageError('invalid');
      const cloud = current.cloud;
      const operation = current.cloud.operation;
      if (operation.kind === 'purge') {
        if (current.work.revision !== cloud.operationRevision) await this.recoveryCopy(current);
        await this.safeRemove(workFilePath(this.paths, id));
        await this.clearRecoveryInternal(id);
        await this.clearPendingSessionInternal(id);
        await this.rebuildIndex();
        return;
      }
      const lifecycle = operation.kind === 'trash' || operation.kind === 'restore';
      const revision = lifecycle ? current.work.revision + 1 : current.work.revision;
      const work = lifecycle ? { ...current.work, revision, deletedAt: result.entry.deletedAt, updatedAt: result.entry.updatedAt } : current.work;
      await this.writeAggregate({ ...current, work, cloud: { ...cloud, version: result.entry.version,
        syncedRevision: lifecycle ? revision : cloud.operationRevision, operation: null, operationRevision: 0 } });
      await this.rebuildIndex();
    });
  }

  private async recoveryCopy(current: WorkAggregate) {
    for (const name of await this.files.list(this.paths.works)) {
      const id = workIdFromFileName(name);
      if (!id) continue;
      const candidate = await this.readAggregate(id);
      if (candidate?.cloud?.recoveryOf === current.work.id && candidate.cloud.recoverySourceRevision === current.work.revision) return candidate;
    }
    const work = asImportedCopy(current.work);
    work.title = (current.work.title.slice(0, 108) + '（本机恢复稿）');
    work.draft.title = work.title;
    work.deletedAt = null;
    const copy: WorkAggregate = { ...current, work, session: current.session ? copySession(current.session, work.id) : null,
      cloud: { ...emptyCloudMetadata(), recoveryOf: current.work.id, recoverySourceRevision: current.work.revision } };
    await this.writeAggregate(copy);
    return copy;
  }

  installRemote(remote: CloudWork): Promise<WorkAggregate | null> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(remote.id);
      if (current?.cloud?.claim || current?.cloud?.recoveryOf) throw new MiniStorageError('conflict');
      if (current && (current.cloud?.version ?? 0) >= remote.version) return current;
      // Never discard an uncommitted AI result or interrupted input while pulling.
      if (await this.files.exists(this.paths.recovery)) {
        const record = recoveryRecordSchema.parse(JSON.parse(await this.files.readText(this.paths.recovery)), zodParseContext);
        if (record.workId === remote.id && record.expectedRevision === (current?.work.revision ?? 0)) {
          throw new MiniStorageError('conflict', { message: '本机还有待恢复输入，请先保存或导出当前内容，再同步云作品。' });
        }
      }
      if (await this.files.exists(`${this.paths.root}/${remote.id}.result.json`)) {
        throw new MiniStorageError('conflict', { message: '本机还有小文回复待保存，请先重试保存或导出当前内容。' });
      }
      if (current && (current.cloud?.syncedRevision ?? 0) < current.work.revision) await this.recoveryCopy(current);
      if (remote.purged || !remote.snapshot) {
        await this.safeRemove(workFilePath(this.paths, remote.id));
        await this.clearRecoveryInternal(remote.id);
        await this.rebuildIndex();
        return null;
      }
      const revision = (current?.work.revision ?? 0) + 1;
      const aggregate: WorkAggregate = { app: 'suiyue-yousheng', schemaVersion: LOCAL_SCHEMA_VERSION, savedAt: this.now().toISOString(),
        ...remote.snapshot, work: { ...remote.snapshot.work, revision },
        cloud: { ...emptyCloudMetadata(), version: remote.version, syncedRevision: revision } };
      await this.writeAggregate(aggregate);
      await this.rebuildIndex();
      return aggregate;
    });
  }

  /** Persist ownership intent before copying, so a crash cannot bind a draft to another account. */
  claim(id: string, accountId: string, targetId: string, complete = false): Promise<WorkAggregate> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(id);
      if (!current) throw new MiniStorageError('missing');
      const cloud = current.cloud ?? emptyCloudMetadata();
      if (cloud.claim && (cloud.claim.accountId !== accountId || cloud.claim.targetId !== targetId)) throw new MiniStorageError('conflict');
      const next = { ...current, cloud: { ...cloud, claim: { accountId, targetId, complete } } };
      await this.writeAggregate(next);
      await this.clearRecoveryInternal(id);
      return next;
    });
  }

  addClaimed(source: WorkAggregate, targetId: string): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      if (await this.readAggregate(targetId)) return;
      let work = clone(source.work);
      let session = source.session ? clone(source.session) : null;
      if (targetId !== source.work.id) {
        work = asImportedCopy(source.work);
        work.id = targetId; work.draft.id = targetId;
        session = source.session ? copySession(source.session, targetId) : null;
      }
      await this.writeAggregate({ ...source, work, session, cloud: emptyCloudMetadata() });
      await this.rebuildIndex();
    });
  }

  promoteRecovery(id: string): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      const current = await this.readAggregate(id);
      if (!current?.cloud?.recoveryOf) throw new MiniStorageError('missing');
      await this.writeAggregate({ ...current, cloud: emptyCloudMetadata() });
    });
  }

}

export class MiniDraftWriter {
  private tail: Promise<unknown> = Promise.resolve();
  private revisions = new Map<string, number>();
  private writingStates = new Map<string, WritingState>();
  setWritingState(id: string, state: WritingState) { this.writingStates.set(id, clone(state)); }
  clearComposerIfMatches(id: string, composer: string) {
    if (this.writingStates.get(id)?.composer === composer) this.writingStates.set(id, emptyWritingState());
  }
  private pending = new Map<string, { context: MiniSessionSaveError['context']; revision: number; durable: boolean }>();

  pendingSession(id: string) { return this.pending.get(id); }

  recoverPending(records: RecoveryRecord[]) {
    for (const record of records) if (record.session && !this.pending.has(record.workId)) {
      this.pending.set(record.workId, { context: { draft: record.draft, session: record.session, work: null }, revision: record.expectedRevision, durable: true });
    }
  }

  constructor(private readonly repository: MiniWorkRepository) {}

  seed(id: string, revision: number) {
    this.revisions.set(id, revision);
  }

  write(draft: Draft, session?: ArticleSession) {
    const snapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : undefined;
    const writingState = this.writingStates.get(snapshot.id);
    const job = this.tail.catch(() => undefined).then(async () => {
      if (this.pending.has(snapshot.id)) throw new Error('请先保存小文已收到的回复，或导出当前内容。');
      const next = await this.repository.save(snapshot, this.revisions.get(snapshot.id) ?? 0, sessionSnapshot, writingState);
      this.revisions.set(snapshot.id, next?.revision ?? 0);
      return next;
    });
    this.tail = job;
    return job;
  }

  preserve(draft: Draft, session?: ArticleSession) {
    const snapshot = clone(draft);
    const sessionSnapshot = session ? clone(session) : undefined;
    const writingState = this.writingStates.get(snapshot.id);
    const job = this.tail.catch(() => undefined).then(async () => {
      if (this.pending.has(snapshot.id)) throw new Error('请先保存小文已收到的回复，或导出当前内容。');
      await this.repository.writeRecovery(snapshot, this.revisions.get(snapshot.id) ?? 0, sessionSnapshot, writingState);
    });
    this.tail = job;
    return job;
  }

  updateLatestSession(id: string, update: (session: ArticleSession) => ArticleSession, fallback?: MiniSessionSaveError['context']) {
    const job = this.tail.catch(() => undefined).then(async () => {
      let snapshot: RepositorySnapshot;
      try { snapshot = await this.repository.load(); }
      catch (error) {
        if (!fallback) throw error;
        const context = { ...fallback, session: update(clone(fallback.session)) };
        this.pending.set(id, { context, revision: fallback.work?.revision ?? this.revisions.get(id) ?? 0, durable: false });
        throw new MiniSessionSaveError(context, false);
      }
      const recovery = snapshot.recovery?.draft.id === id ? snapshot.recovery : null;
      const stored = snapshot.works.find(work => work.id === id && !work.deletedAt) ?? null;
      const draft = recovery?.draft ?? stored?.draft;
      const session = recovery ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id);
      if (!draft || !session) throw new MiniStorageError('missing', { message: '当前文章会话已不存在。' });
      const revision = recovery?.revision ?? stored?.revision ?? 0;
      this.revisions.set(id, revision);
      const nextSession = update(clone(session));
      const context = { draft, session: nextSession, work: stored };
      const pending = { context, revision, durable: false };
      this.pending.set(id, pending);
      try { await this.repository.stageSession(draft, nextSession, revision); pending.durable = true; } catch { /* Try the aggregate; retain memory if both writes fail. */ }
      let work: Work | null;
      try { work = await this.repository.save(clone(draft), revision, clone(nextSession), this.writingStates.get(id)); }
      catch { throw new MiniSessionSaveError(context, pending.durable); }
      this.revisions.set(id, work?.revision ?? 0);
      this.pending.delete(id);
      await this.repository.clearPendingSession(id).catch(() => undefined);
      return { draft, session: nextSession, work };
    });
    this.tail = job;
    return job;
  }

  retrySessionSave(id: string) {
    const job = this.tail.catch(() => undefined).then(async () => {
      const pending = this.pending.get(id);
      if (!pending) throw new Error('没有待保存的小文回复。');
      const { draft, session } = pending.context;
      const work = await this.repository.save(draft, pending.revision, session, this.writingStates.get(id));
      this.revisions.set(id, work?.revision ?? 0);
      this.pending.delete(id);
      await this.repository.clearPendingSession(id).catch(() => undefined);
      return { draft, session, work };
    });
    this.tail = job;
    return job;
  }

  async flush() {
    await this.tail;
    await this.repository.flush();
  }
}
