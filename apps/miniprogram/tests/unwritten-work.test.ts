import { describe, expect, it, vi } from 'vitest';
import { emptyDraft, newSession, startInterview, parseBackupBundle } from '../miniprogram/domain/core';
import { MiniArticleAiController, type MiniAiTransport } from '../miniprogram/ai/controller';
import { MiniDraftWriter, MiniWorkRepository } from '../miniprogram/storage/repository';
import { MemoryFileSystem } from './memory-file-system';

function setup() {
  const files = new MemoryFileSystem();
  const repository = new MiniWorkRepository(files, '/unwritten', undefined, 'author');
  const writer = new MiniDraftWriter(repository);
  const requests: string[] = [];
  const transport: MiniAiTransport = { request(request) {
    requests.push(request.requestId);
    return { response: Promise.resolve({ requestId: request.requestId, result: { answer: '您好。', dialogue: { intent: 'reply' }, citedVersionIds: [] } }), cancel() {} };
  } };
  const controller = new MiniArticleAiController(repository, writer, transport);
  return { files, repository, writer, controller, requests };
}

describe('未开始写作不建立文章', () => {
  it('空稿和只有空格的输入不会创建文章或触发作品变更通知', async () => {
    const s = setup(); const changed = vi.fn(); s.repository.subscribe(changed);
    const draft = { ...emptyDraft(), title: '  ', inputMode: 'text' as const, textDraft: '\n ' };
    expect(await s.writer.write(draft, newSession(draft))).toBeNull();
    expect((await s.repository.load()).works).toEqual([]);
    expect(await s.repository.allAggregates()).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('访谈开场仅保留恢复上下文，重开及备份不增加文章或重复开场', async () => {
    const s = setup(); const changed = vi.fn(); s.repository.subscribe(changed);
    const draft = emptyDraft();
    const started = await s.controller.startInterview(draft, null);
    expect(started.work).toBeNull();
    expect(started.session.conversation?.mode).toBe('interview');
    const repository = new MiniWorkRepository(s.files, '/unwritten', undefined, 'author');
    const snapshot = await repository.load();
    expect(snapshot.works).toEqual([]);
    expect(snapshot.recovery?.draft.id).toBe(draft.id);
    expect(snapshot.recoverySession).toEqual(started.session);
    const writer = new MiniDraftWriter(repository);
    const controller = new MiniArticleAiController(repository, writer);
    const reopened = await controller.startInterview(snapshot.recovery!.draft, snapshot.recoverySession);
    expect(reopened.work).toBeNull();
    expect(reopened.session).toEqual(started.session);
    expect(parseBackupBundle(await repository.exportBackup())).toMatchObject({ works: [], sessions: [] });
    expect(changed).not.toHaveBeenCalled();
    expect(s.requests).toEqual([]);
  });

  it.each(['title', 'voice', 'composer'] as const)('第一次实际%s输入只创建同ID文章并清除临时上下文', async kind => {
    const s = setup(); const draft = emptyDraft();
    const started = await s.controller.startInterview(draft, null);
    const authored = { ...draft, ...(kind === 'title' ? { title: '一段往事' } : kind === 'voice' ? { pendingVoice: '还没确认的第一句话' } : {}) };
    if (kind === 'composer') s.writer.setWritingState(draft.id, { composer: '还没发送的第一句话', inputSource: 'typed' });
    const work = await s.writer.write(authored, started.session);
    const snapshot = await s.repository.load();
    expect(work).toMatchObject({ id: draft.id, revision: 1 });
    expect(snapshot.works).toHaveLength(1);
    expect(snapshot.recovery).toBeNull();
    expect(snapshot.sessions[0]).toEqual(started.session);
    if (kind === 'composer') expect(snapshot.writingStates?.[0].state.composer).toBe('还没发送的第一句话');
  });

  it('第一条实际会话保存请求和结果，失败重试所需历史不被当空稿丢弃', async () => {
    const s = setup(); const draft = emptyDraft();
    const started = await s.controller.startInterview(draft, null);
    const spoken = await s.controller.run(draft, started.session, 'dialogue', '你好');
    expect(spoken.accepted).toBe(true);
    const snapshot = await s.repository.load();
    expect(snapshot.works).toHaveLength(1);
    expect(snapshot.works[0].id).toBe(draft.id);
    expect(snapshot.sessions[0].turns[0].result?.answer).toBe('您好。');
    expect(s.requests).toHaveLength(1);
  });

  it('临时模式保存失败会拒绝，重试成功仍不创建占位文章', async () => {
    const s = setup(); const draft = emptyDraft();
    await s.repository.load();
    s.files.failOnce('writeText', new Error('quota exceeded'), path => path.includes('active-recovery'));
    await expect(s.controller.startInterview(draft, null)).rejects.toMatchObject({ category: 'capacity' });
    expect((await s.repository.load()).works).toEqual([]);
    expect((await s.controller.startInterview(draft, null)).work).toBeNull();
    expect((await s.repository.load()).recoverySession?.conversation?.mode).toBe('interview');
  });

  it('已经保存的文章即使被用户清空，也保持同一作品和最新空值', async () => {
    const s = setup(); const draft = { ...emptyDraft(), title: '后来决定重写', inputMode: 'text' as const, textDraft: '原来写下的正文' };
    await s.writer.write(draft);
    const emptied = { ...draft, title: '', textDraft: '' };
    const work = await s.writer.write(emptied);
    expect(work).toMatchObject({ id: draft.id, revision: 2, segments: [], draft: { title: '', textDraft: '' } });
    expect((await s.repository.load()).works).toHaveLength(1);
  });

  it('旧版已保存的空访谈不会在新规则下被删除，revision冲突仍拒绝', async () => {
    const s = setup(); const draft = { ...emptyDraft(), title: '原有草稿' };
    const session = startInterview(newSession(draft), draft, 'start');
    await s.writer.write(draft, session);
    const empty = { ...draft, title: '' };
    await s.writer.write(empty, session);
    await expect(s.repository.save(empty, 0, session)).rejects.toMatchObject({ category: 'conflict' });
    expect((await s.repository.load()).works[0].id).toBe(draft.id);
  });
});
