import { afterEach, describe, expect, it, vi } from 'vitest';
import { centeredCrops, emptyDraft, workFromDraft, type PublicationPreview, type PublicationStatus } from '../miniprogram/domain/core';
import { MiniPublicationController } from '../miniprogram/publication/controller';
import { MiniPublicationStorage, type PublicationDraft, type PublicationFiles } from '../miniprogram/publication/storage';
import type { MiniPublicationClient, OwnSubmission } from '../miniprogram/publication/client';
import type { miniServices } from '../miniprogram/services';
import { MemoryFileSystem } from './memory-file-system';

const context = vi.hoisted(() => ({ services: {} as ReturnType<typeof miniServices> }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => context.services }));
vi.mock('../miniprogram/auth/page', () => ({ accountPage: (definition: object) => Page(definition) }));
afterEach(() => vi.unstubAllGlobals());
class Images extends MemoryFileSystem implements PublicationFiles {
  async readBinary(path: string) { return Uint8Array.from(JSON.parse(await this.readText(path)) as number[]).buffer; }
  async writeBinary(path: string, bytes: ArrayBuffer) { await this.writeText(path, JSON.stringify([...new Uint8Array(bytes)])); }
  async copy(from: string, to: string) { await this.writeText(to, await this.readText(from)); }
}
interface PublishPage {
  data: { mode: string; title: string; body: string; authorName: string; wordCount: number; draft: PublicationDraft; preview: PublicationPreview | null;
    submission: OwnSubmission | null; error: string; coverError: string; busy: string; pendingRetry: boolean; readOnly: boolean };
  services: ReturnType<typeof miniServices>; controller: MiniPublicationController; loaded: boolean; active: boolean;
  setData(value: object): void; refresh(): Promise<void>; local(): Promise<void>; readWork(): Promise<void>; preparePreview(): Promise<void>;
  submit(): Promise<void>; nameSaved(): Promise<void>; back(): void; cancelCrop(): Promise<void>; confirmCrop(): Promise<void>;
  openCrop(): Promise<void>; chooseCover(): Promise<void>; useLatestCover(): Promise<void>; readSubmission(id?: string): Promise<void>;
}
async function setup(withCover = true) {
  vi.resetModules();
  const files = new Images(), storage = new MiniPublicationStorage(files, '/account-a'); files.set('/photo', '[1,2,3]');
  let work = workFromDraft({ ...emptyDraft(), id: 'work-1', title: '配置页文章', inputMode: 'text', textDraft: '已确认正文' });
  let name = '许知秋', version = 1, frozen: OwnSubmission | null = null;
  const snapshot = (): PublicationPreview => ({ articleId: 'article-1', assetId: 'cover-1', title: work.draft.title, body: work.draft.textDraft,
    authorName: name, aiAssisted: false, workVersion: version, settingsVersion: 1, version: 0 });
  const client = { upload: vi.fn(async () => ({ assetId: 'master-1', width: 640, height: 480, crops: centeredCrops(640, 480) })),
    settings: vi.fn(async () => ({ settingsVersion: 1, assetId: 'cover-1' })), preview: vi.fn(async () => snapshot()),
    submit: vi.fn(async () => { frozen = { ...snapshot(), id: 'submission-1', state: 'pending', reason: '', createdAt: '2026-09-08' };
      return { articleId: 'article-1', submissionId: 'submission-1', version: 1 }; }),
    status: vi.fn(async (): Promise<PublicationStatus> => ({ workId: 'work-1', articleId: 'article-1', version: 0,
      settings: { version: 0, assetId: null, crops: null }, published: false, pending: frozen, lastSubmission: frozen, reason: '' })),
    submission: vi.fn(async () => frozen!), ownImage: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer) };
  const sync = vi.fn(async () => version);
  const services = { account: { snapshot: () => ({ status: 'authenticated', account: { nickname: name } }), refresh: vi.fn(async () => {}) },
    repository: { getAggregate: async () => ({ work, session: undefined }) }, sync: { sync }, publications: client, publicationStorage: storage } as unknown as ReturnType<typeof miniServices>;
  context.services = services;
  const controller = new MiniPublicationController('work-1', storage, client as unknown as MiniPublicationClient, sync,
    () => { if (context.services !== services) throw new Error('账号已变化'); });
  if (withCover) { await controller.choose('/photo', 640, 480); await controller.confirmCrop('reading'); await controller.confirmCrop('thumbnail'); await controller.finishCrop(); }
  let definition!: PublishPage;
  vi.stubGlobal('Page', (value: PublishPage) => { definition = value; });
  vi.stubGlobal('wx', { getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }), pageScrollTo: vi.fn(), setNavigationBarColor: vi.fn(),
    navigateBack: vi.fn(), redirectTo: vi.fn(), switchTab: vi.fn(), showModal: vi.fn(async () => ({ confirm: true })) });
  vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/editor/index' }, { route: 'pages/publish/index' }]);
  await import('../miniprogram/pages/publish/index');
  const page: PublishPage = { ...definition, data: structuredClone(definition.data), services, controller, active: true, loaded: true,
    setData(values) { Object.assign(this.data, values); } };
  await page.local(); await page.readWork();
  return { page, controller, files, storage, client, sync, services,
    change(title: string, body: string, author: string) { work = workFromDraft({ ...work.draft, title, textDraft: body }); name = author; version += 1; } };
}

describe('发表设置与按需阅读预览', () => {
  it('进入设置和改名不准备阅读预览，有效设置可以直接提交', async () => {
    const s = await setup(); await s.page.refresh();
    expect(s.page.data.mode).toBe('settings'); expect(s.client.preview).not.toHaveBeenCalled();
    s.change('配置页文章', '已确认正文', '新署名'); await s.page.nameSaved();
    expect(s.client.preview).not.toHaveBeenCalled(); expect(s.page.data.authorName).toBe('新署名');
    await s.page.submit();
    expect(s.page.data).toMatchObject({ mode: 'result', error: '', preview: null, submission: { title: '配置页文章', authorName: '新署名' } });
    expect(s.client.preview).toHaveBeenCalledTimes(1); expect(s.client.submit).toHaveBeenCalledTimes(1);
  });
  it('缺少封面在封面位置反馈，既不请求预览也不投稿', async () => {
    const s = await setup(false); await s.page.submit();
    expect(s.page.data.coverError).toBe('请先添加封面。'); expect(s.page.data.mode).toBe('settings');
    await s.page.preparePreview(); expect(s.client.preview).not.toHaveBeenCalled(); expect(s.client.submit).not.toHaveBeenCalled();
  });
  it('可选预览只读，返回同篇设置后改稿改名直接提交最新正文', async () => {
    const s = await setup(); const path = s.page.data.draft.path;
    await s.page.preparePreview(); expect(s.page.data.mode).toBe('preview');
    expect(s.page.data.preview).toMatchObject({ body: '已确认正文', authorName: '许知秋' });
    await s.page.submit(); expect(s.client.submit).not.toHaveBeenCalled();
    s.page.back(); expect(s.page.data).toMatchObject({ mode: 'settings', draft: { path }, preview: null });
    s.change('改后的标题', '改后的正文', '改后的署名'); await s.page.readWork();
    await s.page.submit(); expect(s.page.data.submission).toMatchObject({ title: '改后的标题', body: '改后的正文', authorName: '改后的署名' });
    s.change('又改的私有标题', '又改的私有正文', '再改名'); await s.page.readSubmission();
    expect(s.page.data.submission).toMatchObject({ title: '改后的标题', body: '改后的正文', authorName: '改后的署名' });
  });
  it('完成裁切仅返回配置，取消重选还原原封面，不自动上传或预览', async () => {
    const s = await setup(); const before = await s.controller.local();
    await s.controller.choose('/photo', 320, 480); await s.page.local(); s.page.setData({ mode: 'crop', cropKind: 'reading' });
    await s.page.confirmCrop(); await s.page.confirmCrop();
    expect(s.page.data.mode).toBe('settings'); expect(s.client.preview).not.toHaveBeenCalled(); expect(s.client.upload).not.toHaveBeenCalled();
    const current = await s.controller.local();
    await s.controller.choose('/photo', 100, 100); await s.page.local(); s.page.setData({ mode: 'crop' }); await s.page.cancelCrop();
    expect(await s.controller.local()).toEqual(current); expect(current.path).not.toBe(before.path);
  });
  it('响应丢失后设置保留且按钮确认原操作，不受新的页面署名影响', async () => {
    const s = await setup(); s.client.submit.mockRejectedValueOnce(new Error('网络中断'));
    await s.page.submit(); expect(s.page.data).toMatchObject({ mode: 'settings', pendingRetry: true, error: '网络中断' });
    const first = s.client.submit.mock.calls[0];
    s.change('不应准备的新标题', '不应准备的新正文', '新的名字'); await s.page.readWork();
    const prepares = s.client.preview.mock.calls.length; await s.page.submit();
    expect(s.client.submit.mock.calls[1]).toEqual(first); expect(s.client.preview).toHaveBeenCalledTimes(prepares);
  });
  it('预览下载失败仍能返回/留在配置，之后直接提交无需补做预览', async () => {
    const s = await setup(); s.client.ownImage.mockRejectedValueOnce(new Error('图片读取失败'));
    await s.page.preparePreview(); expect(s.page.data).toMatchObject({ mode: 'settings', preview: null, error: '图片读取失败' });
    await s.page.submit(); expect(s.page.data.mode).toBe('result'); expect(s.client.submit).toHaveBeenCalledTimes(1);
  });
  it('账号在封面确认框切换后不读取或写入旧账号设置', async () => {
    const s = await setup();
    vi.mocked(wx.showModal).mockImplementationOnce(async () => { context.services = {} as ReturnType<typeof miniServices>; return { confirm: true, cancel: false, errMsg: '' }; });
    const local = vi.spyOn(s.controller, 'local'); await s.page.useLatestCover();
    expect(local).not.toHaveBeenCalled(); expect(s.client.status).not.toHaveBeenCalled();
  });
});
