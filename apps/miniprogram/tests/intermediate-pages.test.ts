import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, newSession, type ArticleSession, type Draft } from '../miniprogram/domain/core';
import { MiniArticleAiController, type MiniAiContext, type MiniAiTransport } from '../miniprogram/ai/controller';
import { ConversationMemory } from '../miniprogram/state/conversation-memory';
import type { miniServices } from '../miniprogram/services';
import { MiniDraftWriter, MiniWorkRepository } from '../miniprogram/storage/repository';
import { MemoryFileSystem } from './memory-file-system';

type Services = ReturnType<typeof miniServices>;
const context = vi.hoisted(() => ({ services: undefined as unknown as Services }));
vi.mock('../miniprogram/auth/page', () => ({ accountPage: (definition: object) => Page(definition) }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => context.services }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({}) }));
vi.mock('../miniprogram/ui/topic-motion', () => ({ measureTopic: () => {} }));

interface PageState {
  draft: Draft | null;
  session: ArticleSession | null;
  body: string;
  revision: number;
  saved: boolean;
  error: string;
  loadError: string;
  readOnly: boolean;
  syncLabel: string;
  xiaowenComposer: string;
  composer: string;
  resultSavePending: boolean;
}
interface EditorPage {
  services: Services;
  data: PageState;
  open(id?: string): Promise<void>;
  reconnectCloud(): Promise<void>;
  scheduleSave(): void;
  saveNow(): Promise<boolean>;
  flushAutoSave(): Promise<boolean>;
  goBack(): Promise<void>;
  openXiaoWen(): Promise<void>;
  onBodyInput(event: { detail: { value: string } }): void;
  onXiaoWenInput(event: { detail: { value: string } }): void;
  acceptBodyDictation(text: string): void;
  completePendingVoice(): void;
  adoptAiContext(value: MiniAiContext): void;
  setData(value: Record<string, unknown>): void;
}
interface InterviewPage {
  services: Services;
  data: PageState;
  open(id: string): Promise<void>;
  reconnectCloud(): Promise<void>;
  onComposer(event: { detail: { value: string } }): void;
  acceptDictation(text: string): void;
  saveComposer(): Promise<boolean>;
  closeInterview(): Promise<void>;
  setData(value: Record<string, unknown>): void;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function fixture() {
  vi.resetModules();
  const files = new MemoryFileSystem();
  const repository = new MiniWorkRepository(files, '/intermediate-pages', undefined, 'author');
  const writer = new MiniDraftWriter(repository);
  const conversations = new ConversationMemory((id, value) => writer.setWritingState(id, value));
  const transport: MiniAiTransport = { request: request => ({
    response: Promise.resolve({ requestId: request.requestId, result: { answer: '可以继续说。', dialogue: { intent: 'reply' }, citedVersionIds: [] } }), cancel() {},
  }) };
  const articleAi = new MiniArticleAiController(repository, writer, transport);
  context.services = { repository, writer, conversations, articleAi,
    account: { snapshot: () => ({ status: 'authenticated', account: { id: 'author' } }) },
    sync: { open: vi.fn().mockResolvedValue(undefined), snapshot: () => ({ status: 'ready', error: '' }), canEdit: () => true },
    speech: { interrupt: vi.fn() },
  } as unknown as Services;
  const navigation = { reLaunch: vi.fn().mockResolvedValue(undefined), redirectTo: vi.fn().mockResolvedValue(undefined),
    navigateBack: vi.fn(), hideKeyboard: vi.fn() };
  vi.stubGlobal('wx', navigation);
  vi.stubGlobal('getCurrentPages', () => []);
  let definition!: EditorPage;
  vi.stubGlobal('Page', (value: EditorPage) => { definition = value; });
  await import('../miniprogram/pages/editor/index');
  const editor: EditorPage = { ...definition, services: context.services, data: structuredClone(definition.data),
    scheduleSave() {}, setData(value) { Object.assign(this.data, value); } };
  let interviewDefinition!: InterviewPage;
  vi.stubGlobal('Page', (value: InterviewPage) => { interviewDefinition = value; });
  await import('../miniprogram/pages/interview/index');
  const interview: InterviewPage = { ...interviewDefinition, services: context.services, data: structuredClone(interviewDefinition.data),
    setData(value) { Object.assign(this.data, value); } };
  return { editor, interview, files, repository, writer, conversations, articleAi, navigation };
}

describe('中间输入与文章保存的页面边界', () => {
  it('待确认语音可返回和前台继续，同ID保留本次输入但不建立文章或显示已保存', async () => {
    const s = await fixture();
    await s.editor.open();
    const id = s.editor.data.draft!.id;
    s.editor.acceptBodyDictation('还没有确认的一句话');
    await s.editor.goBack();
    expect(s.navigation.reLaunch).toHaveBeenCalledWith({ url: '/pages/works/index' });
    expect(s.editor.data).toMatchObject({ saved: false, revision: 0, error: '', syncLabel: '' });
    await s.editor.reconnectCloud();
    await s.editor.open(id);
    expect(s.editor.data).toMatchObject({ draft: { id, pendingVoice: '还没有确认的一句话' }, body: '', saved: false, loadError: '' });
    expect((await s.repository.load()).works).toEqual([]);
  });

  it('语音确认进入正文时，才用原ID建立唯一文章', async () => {
    const s = await fixture();
    await s.editor.open();
    const id = s.editor.data.draft!.id;
    s.editor.acceptBodyDictation('最终确认的口述');
    expect(await s.editor.flushAutoSave()).toBe(true);
    expect((await s.repository.load()).works).toEqual([]);
    s.editor.completePendingVoice();
    expect(await s.editor.flushAutoSave()).toBe(true);
    expect(s.editor.data).toMatchObject({ saved: true, revision: 1, body: '最终确认的口述', draft: { id, pendingVoice: '' } });
    expect((await s.repository.load()).works.map(work => work.id)).toEqual([id]);
  });

  it('小文输入不触发文件保存，写入失败替身不阻止返回，真正正文随后正常建稿', async () => {
    const s = await fixture();
    await s.editor.open();
    const id = s.editor.data.draft!.id;
    const writing = vi.spyOn(s.writer, 'write').mockRejectedValueOnce(new Error('不应写文件'));
    s.editor.onXiaoWenInput({ detail: { value: '还未发送的话' } });
    await s.editor.goBack();
    expect(writing).not.toHaveBeenCalled();
    expect(s.navigation.reLaunch).toHaveBeenCalledOnce();
    expect(s.conversations.read(id).composer).toBe('还未发送的话');
    expect(s.editor.data).toMatchObject({ saved: false, error: '' });
    writing.mockRestore();
    s.editor.setData({ draft: { ...s.editor.data.draft!, inputMode: 'text' } });
    s.editor.onBodyInput({ detail: { value: '文章正文' } });
    expect(await s.editor.flushAutoSave()).toBe(true);
    expect((await s.repository.load()).works.map(work => work.id)).toEqual([id]);
  });

  it('访谈输入与语音只留内存，关闭再开和前台恢复不会被空持久快照覆盖', async () => {
    const s = await fixture();
    const draft = emptyDraft();
    await s.articleAi.startInterview(draft, null);
    await s.interview.open(draft.id);
    const writing = vi.spyOn(s.writer, 'write');
    s.interview.onComposer({ detail: { value: '还没发送的回答' } });
    s.interview.acceptDictation('补充一句');
    await s.interview.closeInterview();
    expect(writing).not.toHaveBeenCalled();
    expect(s.navigation.redirectTo).toHaveBeenCalledWith({ url: `/pages/editor/index?id=${draft.id}` });
    await s.editor.open(draft.id);
    expect(s.editor.data.xiaowenComposer).toBe('还没发送的回答 补充一句');
    await s.editor.openXiaoWen();
    expect(s.navigation.redirectTo).toHaveBeenLastCalledWith({ url: `/pages/interview/index?id=${draft.id}` });
    await s.interview.reconnectCloud();
    expect(s.interview.data).toMatchObject({ draft: { id: draft.id }, composer: '还没发送的回答 补充一句', error: '', revision: 0 });
    expect((await s.repository.load()).works).toEqual([]);
  });

  it('按指定ID恢复访谈，不被另一个活动草稿的上下文抢占', async () => {
    const s = await fixture();
    const first = emptyDraft(); const second = emptyDraft();
    await s.articleAi.startInterview(first, null);
    await s.articleAi.startInterview(second, null);
    await s.interview.open(first.id);
    expect(s.interview.data).toMatchObject({ draft: { id: first.id }, error: '' });
    await s.editor.open(first.id);
    expect(s.editor.data).toMatchObject({ draft: { id: first.id }, loadError: '' });
    expect((await s.repository.load()).works).toEqual([]);
  });

  it('已存在文章的输入框不改变已保存状态，明确清空正文仍更新原文章', async () => {
    const s = await fixture();
    const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '原来写下的正文' };
    await s.writer.write(draft);
    await s.editor.open(draft.id);
    s.editor.onXiaoWenInput({ detail: { value: '不会成为正文' } });
    expect(s.editor.data.saved).toBe(true);
    s.editor.onBodyInput({ detail: { value: '' } });
    expect(await s.editor.flushAutoSave()).toBe(true);
    expect((await s.repository.load()).works).toMatchObject([{ id: draft.id, revision: 2, draft: { textDraft: '' } }]);
  });

  it('旧文件中的输入框不会在新页面恢复，也不会覆盖本次会话的内存输入', async () => {
    const s = await fixture();
    const draft = { ...emptyDraft(), title: '原文章' };
    await s.writer.write(draft);
    const snapshot = await s.repository.load(draft.id);
    const loading = vi.spyOn(s.repository, 'load').mockResolvedValue({ ...snapshot,
      writingStates: [{ workId: draft.id, state: { composer: '旧文件中的输入', inputSource: 'typed' } }] });
    await s.editor.open(draft.id);
    expect(s.editor.data.xiaowenComposer).toBe('');
    s.conversations.updateComposer(draft.id, '本次输入');
    await s.editor.open(draft.id);
    expect(s.editor.data.xiaowenComposer).toBe('本次输入');
    loading.mockRestore();
  });

  it('收到去除输入框的AI快照时保留当前待确认语音和段落编辑框', async () => {
    const s = await fixture();
    await s.editor.open();
    const draft = { ...s.editor.data.draft!, pendingVoice: '后来又说的一句', segmentEdit: { id: 'paragraph', text: '编辑中的一句' } };
    s.editor.setData({ draft });
    s.editor.adoptAiContext({ draft: { ...draft, pendingVoice: '', segmentEdit: null }, session: newSession(draft), work: null });
    expect(s.editor.data.draft).toMatchObject({ pendingVoice: draft.pendingVoice, segmentEdit: draft.segmentEdit });
    expect(s.editor.data.saved).toBe(false);
  });

  it('未成文章的回复重试保存成功允许收尾，不伪报文章已保存', async () => {
    const s = await fixture();
    await s.editor.open();
    const draft = s.editor.data.draft!;
    vi.spyOn(s.writer, 'retrySessionSave').mockResolvedValue({ draft, session: newSession(draft), work: null });
    s.editor.setData({ resultSavePending: true });
    expect(await s.editor.saveNow()).toBe(true);
    expect(s.editor.data).toMatchObject({ resultSavePending: false, saved: false, error: '' });
    expect((await s.repository.load()).works).toEqual([]);
  });
});
