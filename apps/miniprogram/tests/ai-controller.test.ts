import { describe, expect, it } from 'vitest';
import { MiniArticleAiController, type MiniAiTransport } from '../miniprogram/ai/controller';
import { documentOf, emptyDraft, type AiRequest, type AiResult, type Draft } from '../miniprogram/domain/core';
import { MiniDraftWriter, MiniWorkRepository } from '../miniprogram/storage/repository';
import { MemoryFileSystem } from './memory-file-system';

const writing = (body: string): Draft => ({ ...emptyDraft(), inputMode: 'text', textDraft: body });
const clock = () => new Date('2026-09-01T00:00:00.000Z');

class ResultTransport implements MiniAiTransport {
  requests: AiRequest[] = [];
  constructor(private readonly result: AiResult | Error) {}
  request(request: AiRequest) {
    this.requests.push(request);
    return { response: this.result instanceof Error ? Promise.reject(this.result) : Promise.resolve({ requestId: request.requestId, result: this.result }), cancel() {} };
  }
}

class DeferredTransport implements MiniAiTransport {
  private resolveResponse?: (value: { requestId: string; result: AiResult }) => void;
  private rejectResponse?: (error: Error) => void;
  private requestId = '';
  cancelled = false;
  request(request: AiRequest) {
    this.requestId = request.requestId;
    const response = new Promise<{ requestId: string; result: AiResult }>((resolve, reject) => {
      this.resolveResponse = resolve;
      this.rejectResponse = reject;
    });
    return { response, cancel: () => { this.cancelled = true; this.rejectResponse?.(new Error('cancelled')); } };
  }
  resolve(result: AiResult) { this.resolveResponse?.({ requestId: this.requestId, result }); }
}

const setup = (transport: MiniAiTransport) => {
  const repository = new MiniWorkRepository(new MemoryFileSystem(), '/user', clock);
  const writer = new MiniDraftWriter(repository);
  return { repository, writer, controller: new MiniArticleAiController(repository, writer, transport) };
};

describe('小程序小文文章会话', () => {
  it('重新开启访谈后不能重试旧结束请求，不发网络请求或覆盖新模式', async () => {
    const transport = new ResultTransport(new Error('离线'));
    const { controller } = setup(transport);
    const draft = writing('');
    const started = await controller.startInterview(draft, null);
    const failed = await controller.run(draft, started.session, 'dialogue', '结束访谈并整理', undefined, undefined, 'finish');
    const reopened = await controller.startInterview(draft, failed.session);
    const retry = await controller.run(draft, reopened.session, 'dialogue', '结束访谈并整理', undefined, undefined, 'finish', failed.turnId!);
    expect(retry.accepted).toBe(false);
    expect(retry.error).toContain('已有新的交流');
    expect(retry.session.conversation).toEqual(reopened.session.conversation);
    expect(transport.requests).toHaveLength(1);
  });
  it('空正文问候只保存原始消息，语义开启仍共用同一会话', async () => {
    const transport = new ResultTransport({ answer: '您好，您想聊什么？', dialogue: { intent: 'start' }, citedVersionIds: [] });
    const { controller, repository } = setup(transport);
    const draft = writing('');
    const first = await controller.run(draft, null, 'dialogue', '你来问我吧');
    expect(first.error).toBe('');
    expect(first.session.conversation?.mode).toBe('interview');
    expect(first.session.conversation?.materials).toEqual([]);
    expect(first.session.conversation?.messages[0].text).toBe('你来问我吧');
    expect((await repository.load()).sessions[0].conversation?.mode).toBe('interview');
    expect(documentOf(first.draft).body).toBe('');
  });

  it('结束整理失败保持普通模式，重试不重复原始消息或切换记录', async () => {
    const transport = new ResultTransport(new Error('离线'));
    const { controller, repository, writer } = setup(transport);
    const draft = writing('');
    const started = await controller.startInterview(draft, null);
    const failed = await controller.run(draft, started.session, 'dialogue', '结束访谈并整理', undefined, undefined, 'finish');
    expect(failed.session.conversation?.mode).toBe('conversation');
    const retryController = new MiniArticleAiController(repository, writer, new ResultTransport({ answer: '内容还不足以成文。', dialogue: { intent: 'finish' }, citedVersionIds: [] }));
    const retry = await retryController.run(draft, failed.session, 'dialogue', '结束访谈并整理', undefined, undefined, 'finish', failed.turnId!);
    expect(retry.error).toBe('');
    expect(retry.session.turns).toHaveLength(1);
    expect(retry.session.conversation?.messages.filter(message => message.role === 'user')).toHaveLength(1);
    expect(retry.session.conversation?.mode).toBe('conversation');
  });

  it('保存准备期间也拒绝重复请求', async () => {
    const transport = new ResultTransport({ answer: '您好。', dialogue: { intent: 'reply' }, citedVersionIds: [] });
    const { controller } = setup(transport);
    const draft = writing('');
    const first = controller.run(draft, null, 'dialogue', '你好');
    const duplicate = await controller.run(draft, null, 'dialogue', '你好');
    expect(duplicate.accepted).toBe(false);
    expect((await first).error).toBe('');
    expect(transport.requests).toHaveLength(1);
  });
  it('保存单次请求、完整候选和说明，明确应用后才改变正文，并可撤销', async () => {
    const transport = new ResultTransport({ answer: '把时间顺序说得更清楚，并保留了原有事实。', body: '那年秋天，我回到老院子。', citedVersionIds: [] });
    const { controller, writer } = setup(transport);
    const draft = writing('我回到老院子。');
    writer.seed(draft.id, 0);

    const result = await controller.run(draft, null, 'chat', '帮我理顺时间');
    const turn = result.session.turns.at(-1)!;
    expect(result.accepted).toBe(true);
    expect(turn).toMatchObject({ status: 'ready', prompt: '帮我理顺时间', result: { answer: expect.stringContaining('时间顺序'), body: '那年秋天，我回到老院子。' } });
    expect(documentOf(result.draft).body).toBe('我回到老院子。');
    expect(transport.requests).toHaveLength(1);

    const applied = await controller.apply(result.draft, result.session, turn.id);
    expect(documentOf(applied.draft).body).toBe('那年秋天，我回到老院子。');
    expect(applied.session.turns.at(-1)?.status).toBe('applied');
    expect(applied.session.versions.at(-1)?.source).toBe('rewrite');

    const undone = await controller.undo(applied.draft, applied.session, turn.id);
    expect(documentOf(undone.draft).body).toBe('我回到老院子。');
    expect(undone.session.versions.at(-1)?.source).toBe('restore');
  });

  it('正文改变时拒绝应用旧候选，也能明确放弃而不改正文', async () => {
    const { controller, writer } = setup(new ResultTransport({ answer: '整理说明', body: '候选正文', citedVersionIds: [] }));
    const draft = writing('原正文');
    writer.seed(draft.id, 0);
    const result = await controller.run(draft, null, 'chat', '调整一下');
    const turn = result.session.turns.at(-1)!;
    await expect(controller.apply({ ...result.draft, textDraft: '用户后来手改的正文' }, result.session, turn.id)).rejects.toThrow('正文已发生变化');
    const dismissed = await controller.dismiss(result.draft, result.session, turn.id);
    expect(dismissed.session.turns.at(-1)?.status).toBe('dismissed');
    expect(documentOf(dismissed.draft).body).toBe('原正文');
  });

  it('离线失败进入会话且不重试，不足素材在本机直接拒绝', async () => {
    const transport = new ResultTransport(new Error('当前离线，无法连接小文。'));
    const { controller, writer } = setup(transport);
    const draft = writing('原正文');
    writer.seed(draft.id, 0);
    const failed = await controller.run(draft, null, 'chat', '看看是否清楚');
    expect(failed.session.turns.at(-1)).toMatchObject({ status: 'failed', error: '当前离线，无法连接小文。' });
    expect(transport.requests).toHaveLength(1);
    expect(documentOf(failed.draft).body).toBe('原正文');

    const compose = await controller.run(writing(''), null, 'compose', '根据采访回答整理成文章');
    expect(compose).toMatchObject({ accepted: false, turnId: null, error: '还没有可以整理的回答。' });
    expect(transport.requests).toHaveLength(1);
  });

  it('关闭界面不会取消运行中请求，显式取消才记录取消状态', async () => {
    const transport = new DeferredTransport();
    const { controller, writer } = setup(transport);
    const draft = writing('原正文');
    writer.seed(draft.id, 0);
    let startedResolve!: () => void;
    const started = new Promise<void>(resolve => { startedResolve = resolve; });
    const running = controller.run(draft, null, 'chat', '补充时间', undefined, () => startedResolve());
    await started;
    expect(controller.isRunning(draft.id)).toBe(true);
    transport.resolve({ answer: '已补充时间。', body: '去年秋天的原正文', citedVersionIds: [] });
    expect((await running).session.turns.at(-1)?.status).toBe('ready');
    expect(transport.cancelled).toBe(false);

    const cancelTransport = new DeferredTransport();
    const cancelledSetup = setup(cancelTransport);
    const another = writing('另一篇正文');
    cancelledSetup.writer.seed(another.id, 0);
    let cancelStartedResolve!: () => void;
    const cancelStarted = new Promise<void>(resolve => { cancelStartedResolve = resolve; });
    const pending = cancelledSetup.controller.run(another, null, 'chat', '取消这一条', undefined, () => cancelStartedResolve());
    await cancelStarted;
    await cancelledSetup.controller.cancel(another.id);
    await pending;
    const saved = await cancelledSetup.repository.load();
    expect(saved.sessions[0]?.turns.at(-1)?.status).toBe('cancelled');
    expect(cancelTransport.cancelled).toBe(true);
  });

  it('请求运行期间的新正文保存优先，结果回写只合并会话', async () => {
    const transport = new DeferredTransport();
    const { controller, writer } = setup(transport);
    const draft = writing('请求开始时的正文');
    writer.seed(draft.id, 0);
    let startedContext: Parameters<NonNullable<Parameters<typeof controller.run>[5]>>[0] | undefined;
    let startedResolve!: () => void;
    const started = new Promise<void>(resolve => { startedResolve = resolve; });
    const running = controller.run(draft, null, 'chat', '调整一下', undefined, context => { startedContext = context; startedResolve(); });
    await started;
    const edited = { ...draft, textDraft: '请求期间用户保存的新正文' };
    await writer.write(edited, startedContext!.session);
    transport.resolve({ answer: '候选说明', body: '小文候选正文', citedVersionIds: [] });
    const result = await running;
    expect(documentOf(result.draft).body).toBe('请求期间用户保存的新正文');
    expect(result.session.turns.at(-1)?.status).toBe('ready');
  });

  it('采访丢弃意外候选，素材矛盾说明保持为回答而不自动成文', async () => {
    const interviewSetup = setup(new ResultTransport({ answer: '请再说说当时是谁先回到院子？', body: '不应出现的候选', citedVersionIds: [] }));
    const interviewDraft = writing('我记得有人先回去了。');
    interviewSetup.writer.seed(interviewDraft.id, 0);
    const interview = await interviewSetup.controller.run(interviewDraft, null, 'interview', '继续采访');
    expect(interview.session.turns.at(-1)).toMatchObject({ status: 'answered', result: { answer: expect.stringContaining('谁先') } });
    expect(interview.session.turns.at(-1)?.result?.body).toBeUndefined();

    const composeSetup = setup(new ResultTransport({ answer: '两次回答对返乡时间的说法不一致，请先核对。', citedVersionIds: [] }));
    const composeDraft: Draft = { ...writing(''), materials: [{ id: 'answer-1', source: 'interview-answer', text: '一处说春天，一处说秋天。',
      question: '什么时候回去的？', createdAt: '2026-09-01T08:00:00.000Z', selected: true }] };
    composeSetup.writer.seed(composeDraft.id, 0);
    const compose = await composeSetup.controller.run(composeDraft, null, 'compose', '根据采访回答整理成文章');
    expect(compose.session.turns.at(-1)).toMatchObject({ status: 'answered', result: { answer: expect.stringContaining('不一致') } });
    expect(documentOf(compose.draft).body).toBe('');
  });
});
