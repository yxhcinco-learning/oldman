import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, workFromDraft, type ArticleSession, type Draft } from '../miniprogram/domain/core';
import type { miniServices } from '../miniprogram/services';
import { MiniDraftWriter, MiniWorkRepository } from '../miniprogram/storage/repository';
import { workFilePath } from '../miniprogram/storage/paths';
import { emptyCloudMetadata } from '../miniprogram/storage/schema';
import { MemoryFileSystem } from './memory-file-system';

type Services = ReturnType<typeof miniServices>;
const context = vi.hoisted(() => ({ services: undefined as unknown as Services }));
vi.mock('../miniprogram/auth/page', () => ({ accountPage: (definition: object) => Page(definition) }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => context.services }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({}) }));
vi.mock('../miniprogram/ui/topic-motion', () => ({ measureTopic: () => {} }));

interface EditorPage {
  services: Services;
  data: { draft: Draft | null; session: ArticleSession | null; body: string; revision: number; saved: boolean;
    readOnly: boolean; error: string; loadError: string; cloudVersion: number; xiaowenComposer: string };
  open(id?: string): Promise<void>;
  onHide(): void;
  onShow(): void;
  reconnectCloud(): Promise<void>;
  refreshCloudState(): Promise<void>;
  flushAutoSave(): Promise<boolean>;
  retryError(): Promise<void>;
  returnToWorks(): void;
  nextPublication(): Promise<void>;
  setData(value: Record<string, unknown>): void;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function fixture() {
  vi.resetModules();
  const files = new MemoryFileSystem();
  const repository = new MiniWorkRepository(files, '/editor-resume', () => new Date('2026-09-07T10:00:00.000Z'), 'author');
  const writer = new MiniDraftWriter(repository);
  const verify = vi.fn().mockResolvedValue(undefined);
  context.services = { repository, writer,
    account: { snapshot: () => ({ status: 'authenticated', account: { id: 'author' } }) },
    sync: { open: verify, snapshot: () => ({ status: 'ready', error: '' }), canEdit: () => true },
    articleAi: { isRunning: () => false }, speech: { interrupt: vi.fn() },
    conversations: { read: () => ({ composer: '', requestStatus: 'idle', error: '' }), hydrate: vi.fn() },
  } as unknown as Services;
  let definition!: EditorPage;
  vi.stubGlobal('Page', (value: EditorPage) => { definition = value; });
  await import('../miniprogram/pages/editor/index');
  const page: EditorPage = { ...definition, services: context.services, data: structuredClone(definition.data),
    setData(value: Record<string, unknown>) { Object.assign(this.data, value); } };
  return { page, files, repository, writer, verify };
}

async function hideAndShow(page: EditorPage) {
  page.onHide();
  await page.flushAutoSave();
  const reconnect = vi.spyOn(page, 'reconnectCloud');
  page.onShow();
  expect(reconnect).toHaveBeenCalledOnce();
  await reconnect.mock.results[0].value;
}

describe('编辑器前台恢复与读取重试', () => {
  it('下一步先落盘当前输入，再进入同一作品的发表设置', async () => {
    const { page, repository } = await fixture();
    await page.open();
    page.setData({ draft: { ...page.data.draft!, title: '新文章', inputMode: 'text' }, body: '尚未自动保存的正文' });
    const navigateTo = vi.fn(async () => {
      expect((await repository.getAggregate(page.data.draft!.id))?.work.draft.textDraft).toBe('尚未自动保存的正文');
    });
    vi.stubGlobal('wx', { navigateTo });
    await page.nextPublication();
    expect(navigateTo).toHaveBeenCalledExactlyOnceWith({ url: '/pages/publish/index?id=' + page.data.draft!.id });
  });

  it('缺少标题复用标题编辑入口，只有待确认语音时不能进入发表', async () => {
    const { page } = await fixture();
    const navigateTo = vi.fn(); vi.stubGlobal('wx', { navigateTo });
    await page.open();
    page.setData({ draft: { ...page.data.draft!, inputMode: 'text' }, body: '先写正文' });
    await page.nextPublication();
    expect(page.data).toMatchObject({ titleDialog: true });
    page.setData({ titleDialog: false, draft: { ...page.data.draft!, title: '只有语音', textDraft: '', pendingVoice: '仍然私有' }, body: '' });
    await page.nextPublication();
    expect(page.data).toMatchObject({ notice: '请先写下正文，再进入发表设置。' });
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('下一步保存失败保留输入，不打开发表页', async () => {
    const { page, writer } = await fixture();
    const navigateTo = vi.fn(); vi.stubGlobal('wx', { navigateTo });
    await page.open();
    page.setData({ draft: { ...page.data.draft!, title: '新文章', inputMode: 'text' }, body: '当前输入' });
    vi.spyOn(writer, 'write').mockRejectedValueOnce(new Error('本机空间不足'));
    await page.nextPublication();
    expect(page.data).toMatchObject({ body: '当前输入', error: '本机空间不足' });
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it.each(['voice', 'text'] as const)('未落盘的 %s 空白稿返回前台保留标识与输入方式，不生成空作品或误报缺失', async inputMode => {
    const { page, repository, writer, verify } = await fixture();
    const writing = vi.spyOn(writer, 'write');
    await page.open();
    const draft = { ...page.data.draft!, inputMode };
    page.setData({ draft });
    await hideAndShow(page);
    expect(page.data).toMatchObject({ draft, body: '', revision: 0, saved: false, error: '', loadError: '', readOnly: false });
    expect((await repository.load()).works).toEqual([]);
    expect(writing).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])('schema %i 已落盘的空正文仍按已有作品核对和恢复', async schemaVersion => {
    const { page, files, repository, verify } = await fixture();
    const work = { ...workFromDraft(emptyDraft()), revision: 7 };
    files.set(workFilePath(repository.paths, work.id), JSON.stringify({ app: 'suiyue-yousheng', schemaVersion,
      savedAt: '2026-09-07T10:00:00.000Z', work, session: null }));
    await page.open(work.id);
    await hideAndShow(page);
    expect(page.data).toMatchObject({ draft: work.draft, body: '', revision: 7, saved: true, error: '', loadError: '', readOnly: false });
    expect(verify.mock.calls).toEqual([[work.id], [work.id]]);
    expect((await repository.load()).works).toHaveLength(1);
  });

  it('新稿已有输入时先保存，再按同一作品重新核对', async () => {
    const { page, repository, verify } = await fixture();
    await page.open();
    const draft = { ...page.data.draft!, inputMode: 'text' as const };
    page.setData({ draft, body: '前台返回前尚未落盘的文字' });
    await page.reconnectCloud();
    expect(page.data).toMatchObject({ body: '前台返回前尚未落盘的文字', revision: 1, saved: true, error: '', loadError: '' });
    expect((await repository.load()).works[0].id).toBe(draft.id);
    expect(verify).toHaveBeenCalledExactlyOnceWith(draft.id);
  });

  it('刷盘失败时不重开、不丢正文，重试执行保存', async () => {
    const { page, writer, verify } = await fixture();
    await page.open();
    page.setData({ draft: { ...page.data.draft!, inputMode: 'text' }, body: '当前未保存的输入' });
    const writing = vi.spyOn(writer, 'write').mockRejectedValueOnce(new Error('本机空间不足'));
    await page.reconnectCloud();
    expect(page.data).toMatchObject({ body: '当前未保存的输入', error: '本机空间不足', loadError: '', saved: false });
    expect(verify).not.toHaveBeenCalled();
    await page.retryError();
    expect(writing).toHaveBeenCalledTimes(2);
    expect(page.data).toMatchObject({ body: '当前未保存的输入', error: '', saved: true });
  });

  it('指定作品读取失败时重新读取原 ID，不以空保存假报成功', async () => {
    const { page, repository, writer, verify } = await fixture();
    const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '原文章' };
    await repository.save(draft, 0);
    const writing = vi.spyOn(writer, 'write');
    vi.spyOn(repository, 'load').mockRejectedValueOnce(new Error('no such file'));
    await page.open(draft.id);
    expect(page.data.loadError).toBeTruthy();
    expect(page.data).toMatchObject({ draft: null, error: '', readOnly: true });
    await page.retryError();
    expect(page.data).toMatchObject({ body: '原文章', error: '', loadError: '', saved: true, readOnly: false });
    expect(verify.mock.calls).toEqual([[draft.id], [draft.id]]);
    expect(writing).not.toHaveBeenCalled();
  });

  it('不存在的 ID 不创建新稿，保留重新打开与返回文章的路径', async () => {
    const { page, repository, verify } = await fixture();
    const reLaunch = vi.fn();
    vi.stubGlobal('wx', { reLaunch });
    await page.open('missing-article');
    await page.retryError();
    await page.refreshCloudState();
    expect(page.data).toMatchObject({ draft: null, error: '', readOnly: true });
    expect(page.data.loadError).toBe('暂时找不到这篇文章，请重新打开或返回文章列表。');
    expect(verify.mock.calls).toEqual([['missing-article'], ['missing-article']]);
    expect((await repository.load()).works).toEqual([]);
    page.returnToWorks();
    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/works/index' });
  });

  it('已有文章被移入回收站，返回前台保留原文只读，不能作为新稿复活', async () => {
    const { page, repository, writer } = await fixture();
    const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '可以导出的原正文' };
    await repository.save(draft, 0);
    await page.open(draft.id);
    await repository.setDeleted(draft.id, true, 1);
    const writing = vi.spyOn(writer, 'write');
    await hideAndShow(page);
    await page.refreshCloudState();
    expect(page.data).toMatchObject({ body: '可以导出的原正文', readOnly: true });
    expect(page.data.loadError).toBeTruthy();
    await page.retryError();
    expect(writing).not.toHaveBeenCalled();
    expect((await repository.getAggregate(draft.id))?.work.deletedAt).toBeTruthy();
  });

  it('已入云文章返回前台仍等待核对完成，不能因正文为空跳过', async () => {
    const { page, files, repository, verify } = await fixture();
    const work = workFromDraft(emptyDraft());
    files.set(workFilePath(repository.paths, work.id), JSON.stringify({ app: 'suiyue-yousheng', schemaVersion: 3,
      savedAt: '2026-09-07T10:00:00.000Z', work, session: null, cloud: { ...emptyCloudMetadata(), version: 2, syncedRevision: 1 } }));
    await page.open(work.id);
    expect(page.data.cloudVersion).toBe(2);
    let resume!: () => void;
    verify.mockReturnValueOnce(new Promise<void>(resolve => { resume = resolve; }));
    const reconnect = page.reconnectCloud();
    await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    expect(page.data.readOnly).toBe(true);
    resume(); await reconnect;
    expect(page.data).toMatchObject({ error: '', loadError: '', readOnly: false });
  });
});
