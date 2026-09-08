import { describe, expect, it, vi } from 'vitest';
import { emptyDraft, newSession, startInterview, completeVoice, parseBackupBundle, type AiResponse } from '../miniprogram/domain/core';
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

  it.each(['title', 'body', 'confirmed-voice'] as const)('第一次实际%s输入只创建同ID文章并清除临时上下文', async kind => {
    const s = setup(); const draft = emptyDraft();
    const started = await s.controller.startInterview(draft, null);
    const authored = kind === 'confirmed-voice' ? completeVoice({ ...draft, pendingVoice: '已确认加入正文的第一句话' })
      : { ...draft, ...(kind === 'title' ? { title: '一段往事' } : { inputMode: 'text' as const, textDraft: '真正写入正文' }) };
    const work = await s.writer.write(authored, started.session);
    const snapshot = await s.repository.load();
    expect(work).toMatchObject({ id: draft.id, revision: 1 });
    expect(snapshot.works).toHaveLength(1);
    expect(snapshot.recovery).toBeNull();
    expect(snapshot.sessions[0]).toEqual(started.session);
    expect(await s.files.exists(`${s.repository.paths.root}/${draft.id}.context.json`)).toBe(false);
  });

  it('第一条实际会话只保存独立请求和结果上下文，不创建或导出文章', async () => {
    const s = setup(); const draft = emptyDraft();
    const started = await s.controller.startInterview(draft, null);
    const spoken = await s.controller.run(draft, started.session, 'dialogue', '你好');
    expect(spoken.accepted).toBe(true);
    const snapshot = await s.repository.load();
    expect(snapshot.works).toHaveLength(0);
    expect(snapshot.recovery?.draft.id).toBe(draft.id);
    expect(snapshot.recoverySession?.turns[0].result?.answer).toBe('您好。');
    expect(parseBackupBundle(await s.repository.exportBackup()).works).toEqual([]);
    expect(s.requests).toHaveLength(1);
  });

  it.each(['voice', 'composer', 'segment-edit'] as const)('%s输入框有内容仍不建稿，输入只留当前内存', async kind => {
    const s = setup(), marker = '仅在输入框内的中间内容';
    const draft = { ...emptyDraft(), ...(kind === 'voice' ? { pendingVoice: marker }
      : kind === 'segment-edit' ? { segmentEdit: { id: 'pending', text: marker } } : {}) };
    const session = startInterview(newSession(draft), draft, 'open');
    s.writer.setWritingState(draft.id, { composer: kind === 'composer' ? marker : '', inputSource: 'typed' });
    expect(await s.writer.write(draft, session)).toBeNull();
    const local = await s.repository.load(draft.id);
    expect(local.works).toEqual([]);
    expect(local.recovery?.draft.pendingVoice).toBe(draft.pendingVoice);
    expect(local.recovery?.draft.segmentEdit).toEqual(draft.segmentEdit);
    expect([...s.files.files.values()].join('')).not.toContain(marker);
    const restarted = await new MiniWorkRepository(s.files, '/unwritten', undefined, 'author').load(draft.id);
    expect(restarted.recovery?.draft).toMatchObject({ pendingVoice: '', segmentEdit: null });
    expect(parseBackupBundle(await s.repository.exportBackup()).works).toEqual([]);
  });

  it('已有文章的输入框变化不增加修订或改变待上传快照', async () => {
    const s = setup(), draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '已写入正文' };
    const saved = (await s.writer.write(draft))!;
    const operation = await s.repository.queueMutation(draft.id);
    s.writer.setWritingState(draft.id, { composer: '小文输入框的文字', inputSource: 'typed' });
    const result = await s.writer.write({ ...draft, pendingVoice: '语音输入框文字' });
    expect(result?.revision).toBe(saved.revision);
    const aggregate = (await s.repository.getAggregate(draft.id))!;
    expect(aggregate.cloud?.operation).toEqual(operation);
    expect(aggregate.work.draft.pendingVoice).toBe('');
    expect(aggregate.writingState?.composer).toBe('');
    expect((await s.repository.load(draft.id)).works[0].draft.pendingVoice).toBe('语音输入框文字');
  });

  it('另一上下文打开后迟到回复归原ID，重启仍能恢复且不抢占当前上下文', async () => {
    const s = setup(); let resolve!: (result: AiResponse) => void;
    const transport: MiniAiTransport = { request(request) {
      return { response: new Promise<AiResponse>(done => { resolve = result => done({ ...result, requestId: request.requestId }); }), cancel() {} };
    } };
    const controller = new MiniArticleAiController(s.repository, s.writer, transport);
    const first = emptyDraft(), second = emptyDraft();
    const running = controller.run(first, null, 'dialogue', '我想说段往事');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    await s.writer.write(second, startInterview(newSession(second), second, 'second'));
    resolve({ requestId: 'set-by-transport', result: { answer: '我在听。', dialogue: { intent: 'reply' }, citedVersionIds: [] } });
    const result = await running;
    expect(result.accepted).toBe(true); expect(result.work).toBeNull();
    expect((await s.repository.load()).recovery?.draft.id).toBe(second.id);
    const restarted = new MiniWorkRepository(s.files, '/unwritten', undefined, 'author');
    expect((await restarted.load(first.id)).recoverySession?.turns[0].result?.answer).toBe('我在听。');
    expect((await restarted.load(second.id)).recoverySession?.conversation?.mode).toBe('interview');
    expect((await restarted.load()).works).toEqual([]);
    expect(await s.files.exists(`${s.repository.paths.root}/${first.id}.result.json`)).toBe(false);
  });

  it('无正文候选的上下文保存失败可从日志重试，采用后才建立原ID文章', async () => {
    const s = setup(), draft = emptyDraft();
    const controller = new MiniArticleAiController(s.repository, s.writer, { request(request) {
      s.files.failOnce('writeText', new Error('quota exceeded'), path => path.endsWith('.context.json.tmp'));
      return { response: Promise.resolve({ requestId: request.requestId,
        result: { answer: '请先核对候选。', body: '确认后才进入正文的文章。', dialogue: { intent: 'edit' }, citedVersionIds: [] } }), cancel() {} };
    } });
    await expect(controller.run(draft, null, 'dialogue', '帮我整理')).rejects.toMatchObject({ name: 'MiniSessionSaveError', durable: true });
    const restarted = new MiniWorkRepository(s.files, '/unwritten', undefined, 'author');
    const snapshot = await restarted.load(draft.id);
    expect(snapshot.works).toEqual([]); expect(snapshot.pendingSessions).toHaveLength(1);
    expect(parseBackupBundle(await restarted.exportBackup()).works).toEqual([]);
    const writer = new MiniDraftWriter(restarted); writer.recoverPending(snapshot.pendingSessions);
    const retried = await writer.retrySessionSave(draft.id);
    expect(retried.work).toBeNull();
    expect((await restarted.load(draft.id)).pendingSessions).toEqual([]);
    const applied = await new MiniArticleAiController(restarted, writer).apply(retried.draft, retried.session, retried.session.turns[0].id);
    expect(applied.work).toMatchObject({ id: draft.id, revision: 1 });
    expect(applied.draft.textDraft).toBe('确认后才进入正文的文章。');
    expect((await restarted.load()).works).toHaveLength(1);
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
