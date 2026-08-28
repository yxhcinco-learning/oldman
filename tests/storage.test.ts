import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { IndexedWorkRepository, DraftWriter, ConflictError, type WorkRepository } from '../lib/storage/repository';
import { emptyDraft, completeSegment, completeVoice, effectiveSegments, type Draft } from '../lib/domain/writing';
import { makeBackup, parseBackup, parseBackupBundle } from '../lib/storage/backup';
import { newSession } from '../lib/domain/article-ai';
import { Workspace } from '../features/writing/workspace';

const repositories: IndexedWorkRepository[] = [];
const repository = () => { const r = new IndexedWorkRepository(crypto.randomUUID()); repositories.push(r); return r; };
const writing = (text = '第一段\n\n第二段'): Draft => ({ ...emptyDraft(), inputMode: 'text', textDraft: text });
afterEach(async () => { for (const repo of repositories.splice(0)) await repo.close(); });

describe('IndexedDB works and recovery', () => {
  it('starts empty, keeps an empty recovery without seeding mock works', async () => {
    const repo = repository(); expect((await repo.load()).works).toEqual([]);
    const draft = emptyDraft(); await repo.save(draft, 0);
    const loaded = await repo.load(); expect(loaded.works).toHaveLength(0); expect(loaded.recovery?.draft).toEqual(draft);
  });
  it('restores text, pending transcription and an unfinished segment edit', async () => {
    const repo = repository(); const draft = writing();
    draft.pendingVoice = '刚刚说的话'; draft.segmentEdit = { id: 'pending', text: '正在修改的语音' };
    const work = await repo.save(draft, 0);
    expect(work?.title).toBe('未命名作品'); expect(work?.revision).toBe(1);
    expect((await repo.load()).recovery?.draft).toEqual(draft);
    const workspace = new Workspace(repo); await workspace.initialize(); expect(workspace.state.draft).toEqual(draft);
  });
  it('serializes rapid writes without stale overwrite', async () => {
    const repo = repository(); const writer = new DraftWriter(repo); const draft = writing();
    const jobs = Array.from({ length: 25 }, (_, i) => writer.write({ ...draft, textDraft: `第${i}次修改` }));
    await Promise.all(jobs);
    const work = (await repo.load()).works[0]; expect(work.revision).toBe(25); expect(work.segments[0].text).toBe('第24次修改');
  });
  it('rejects another tab revision and preserves existing data', async () => {
    const repo = repository(); const draft = writing('原文'); await repo.save(draft, 0);
    await expect(repo.save({ ...draft, textDraft: '过期副本' }, 0)).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.load()).works[0].segments[0].text).toBe('原文');
  });
  it('soft deletes and restores without losing content or reviving from an old editor', async () => {
    const repo = repository(); const draft = writing(); await repo.save(draft, 0);
    await repo.setDeleted(draft.id, true, 1);
    const removed = await repo.load(); expect(removed.works[0].deletedAt).not.toBeNull(); expect(removed.recovery).toBeNull();
    await expect(repo.save(draft, 2)).rejects.toBeInstanceOf(ConflictError);
    await repo.setDeleted(draft.id, false, 2);
    expect((await repo.load()).works[0].deletedAt).toBeNull(); expect((await repo.load()).works[0].revision).toBe(3);
  });
  it('clears recovery only for the matching active document', async () => {
    const repo = repository(); const draft = writing(); await repo.save(draft, 0); await repo.clearRecovery('another');
    expect((await repo.load()).recovery).not.toBeNull(); await repo.clearRecovery(draft.id); expect((await repo.load()).recovery).toBeNull();
  });
  it('does not delete a database from a newer version', async () => {
    const name = crypto.randomUUID(); const db = await openDB(name, 3, { upgrade(db) { db.createObjectStore('future'); } });
    await db.put('future', 'important', 'data'); db.close();
    const repo = new IndexedWorkRepository(name); await expect(repo.load()).rejects.toBeTruthy();
    const verify = await openDB(name, 3); expect(await verify.get('future', 'data')).toBe('important'); verify.close();
  });
});

describe('portable backups', () => {
  it('imports validated backups as new copies with new segment ids', async () => {
    const repo = repository(); const draft = writing(); await repo.save(draft, 0);
    const before = (await repo.load()).works; const backup = makeBackup(before);
    expect(await repo.importBackup(backup)).toBe(1);
    const works = (await repo.load()).works; expect(works).toHaveLength(2);
    const imported = works.find(w => w.id !== draft.id)!; expect(imported.title).toContain('副本'); expect(imported.segments[0].id).not.toBe(before[0].segments[0].id);
    expect(works.find(w => w.id === draft.id)).toEqual(before[0]);
  });
  it('rejects invalid or future backups without changing stored works', async () => {
    const repo = repository(); await repo.save(writing(), 0); const before = await repo.load();
    for (const raw of ['{broken', makeBackup(before.works).replace('"schemaVersion": 2', '"schemaVersion": 99'), '{"app":"other"}']) {
      await expect(repo.importBackup(raw)).rejects.toBeTruthy(); expect(await repo.load()).toEqual(before);
    }
  });
  it('can export unsaved current content when storage has failed', () => {
    const draft = writing('未保存但能导出的内容'); draft.pendingVoice = '待确认';
    const works = parseBackup(makeBackup([], draft)); expect(works[0].draft.pendingVoice).toBe('待确认'); expect(works[0].segments[0].text).toBe(draft.textDraft);
  });
  it('does not import partial records when validation fails', async () => {
    const repo = repository(); await repo.save(writing(), 0); const raw = JSON.parse(makeBackup((await repo.load()).works));
    raw.works.push({ ...raw.works[0], id: 'mismatch' }); await expect(repo.importBackup(JSON.stringify(raw))).rejects.toBeTruthy();
    expect((await repo.load()).works).toHaveLength(1);
  });
  it('upgrades v1 without changing works or recovery and accepts v1 backups', async () => {
    const name = crypto.randomUUID(); const source = repository(); const draft = writing('旧版正文'); const work = await source.save(draft, 0);
    const old = await openDB(name, 1, { upgrade(db) { db.createObjectStore('works', { keyPath: 'id' }); db.createObjectStore('recovery'); } });
    await old.put('works', work); await old.put('recovery', { draft, revision: 1 }, 'active'); old.close();
    const upgraded = new IndexedWorkRepository(name); repositories.push(upgraded);
    expect(await upgraded.load()).toEqual({ works: [work], recovery: { draft, revision: 1 }, sessions: [] });
    const v1 = { ...JSON.parse(makeBackup([work!])), schemaVersion: 1 }; delete v1.sessions;
    expect(await upgraded.importBackup(JSON.stringify(v1))).toBe(1);
    expect((await upgraded.load()).works.find(w => w.id === work!.id)).toEqual(work);
  });
  it('restores session versions and references as an independent copy and retains recycle history', async () => {
    const repo = repository(); const draft = writing('有历史的原文'); const session = newSession(draft);
    session.turns.push({ id: 'answer', createdAt: new Date().toISOString(), action: 'question', prompt: '旧内容呢', inputVersionId: session.versions[0].id,
      status: 'answered', result: { answer: '请看这个版本。', citedVersionIds: [session.versions[0].id] } });
    await repo.save(draft, 0, session);
    await repo.setDeleted(draft.id, true, 1); await repo.setDeleted(draft.id, false, 2);
    const before = await repo.load(); expect(before.sessions).toEqual([session]);
    const backup = makeBackup(before.works, null, before.sessions); expect(parseBackupBundle(backup).sessions).toEqual([session]);
    await repo.importBackup(backup);
    const restored = await repo.load(); const copy = restored.sessions.find(s => s.workId !== draft.id)!;
    expect(copy.versions[0].id).not.toBe(session.versions[0].id);
    expect(copy.turns[0].inputVersionId).toBe(copy.versions[0].id);
    expect(copy.turns[0].result?.citedVersionIds).toEqual([copy.versions[0].id]);
    expect(restored.works.find(w => w.id === draft.id)).toEqual(before.works[0]);
    const invalid = JSON.parse(backup); invalid.sessions[0].turns[0].inputVersionId = 'missing';
    await expect(repo.importBackup(JSON.stringify(invalid))).rejects.toThrow();
    expect(await repo.load()).toEqual(restored);
  });
  it('rejects a conflicting session write atomically with its candidate body', async () => {
    const repo = repository(); const draft = writing('原文'); const session = newSession(draft); await repo.save(draft, 0, session);
    await expect(repo.save({ ...draft, textDraft: '不应写入' }, 0, { ...session, turns: [] })).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.load()).sessions).toEqual([session]); expect((await repo.load()).works[0].draft.textDraft).toBe('原文');
  });
});

describe('editing and failure semantics', () => {
  it('preserves poem line breaks and commits voice only once', () => {
    let draft = writing('春风\n吹过窗前\n\n我想说的话'); draft.segments = effectiveSegments(draft); draft.inputMode = 'voice'; draft.pendingVoice = '新的一段';
    expect(draft.segments).toHaveLength(2); expect(draft.segments[0].text).toBe('春风\n吹过窗前');
    draft = completeVoice(draft); expect(completeVoice(draft).segments).toHaveLength(3);
    draft.segmentEdit = { id: draft.segments[0].id, text: '' }; expect(completeSegment(draft).segments).toHaveLength(2);
  });
  it('shows failure rather than saved and keeps the editor open', async () => {
    const repo: WorkRepository = { load: vi.fn().mockResolvedValue({ works: [], recovery: null }), save: vi.fn().mockRejectedValue(new Error('空间不足')),
      clearRecovery: vi.fn(), setDeleted: vi.fn(), importBackup: vi.fn() };
    const workspace = new Workspace(repo); await workspace.initialize(); const draft = writing();
    expect(await workspace.update(draft)).toBe(false); expect(workspace.state.saveStatus).toBe('error'); expect(workspace.state.draft).toEqual(draft);
    expect(await workspace.finish()).toBe(false); expect(repo.clearRecovery).not.toHaveBeenCalled();
    expect(parseBackup(makeBackup(workspace.state.works, workspace.state.draft))).toHaveLength(1);
  });
  it('does not close over a newer edit made while finishing', async () => {
    const repo = repository(); const workspace = new Workspace(repo); await workspace.initialize(); await workspace.update(writing('先前内容'));
    const originalClear = repo.clearRecovery.bind(repo); let release!: () => void;
    const clear = vi.spyOn(repo, 'clearRecovery').mockImplementationOnce(async id => { await new Promise<void>(resolve => { release = resolve; }); await originalClear(id); });
    const finished = workspace.finish(); await vi.waitFor(() => expect(clear).toHaveBeenCalled());
    await workspace.update({ ...workspace.state.draft!, textDraft: '保存期间新输入的内容' }); release(); await finished;
    expect(workspace.state.draft).toBeNull(); expect((await repo.load()).works[0].segments[0].text).toBe('保存期间新输入的内容'); expect((await repo.load()).recovery).toBeNull();
  });
});
