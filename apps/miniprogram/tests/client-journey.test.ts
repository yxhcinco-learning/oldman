import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, workFromDraft, type PublicationStatus } from '../miniprogram/domain/core';
import { emptyPublicationDraft } from '../miniprogram/publication/storage';
import type { miniServices } from '../miniprogram/services';
import type { MiniPublicationController } from '../miniprogram/publication/controller';

const context = vi.hoisted(() => ({ services: {} as ReturnType<typeof miniServices> }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => context.services }));
vi.mock('../miniprogram/auth/page', () => ({ accountPage: (value: object) => Page(value) }));
afterEach(() => { vi.unstubAllGlobals(); });
interface PageState { data: Record<string, unknown>; setData(value: object): void }
async function capture<T extends PageState>(load: () => Promise<unknown>) {
  vi.resetModules();
  let definition!: T;
  vi.stubGlobal('Page', (value: T) => { definition = value; });
  vi.stubGlobal('Component', (value: { data: object; methods: object }) => { definition = { ...value.methods, data: { recycle: false, ...value.data }, triggerEvent: vi.fn() } as T; });
  await load();
  return { ...definition, data: structuredClone(definition.data), setData(value: object) { Object.assign(this.data, value); } } as T;
}
interface WorkPage extends PageState { refresh(connect?: boolean): Promise<void>; selectFilter(event: object): void; toggleManage(): void; filterCards(): void; more(): void; moveToRecycle(event: object): Promise<void> }
interface PublishPage extends PageState { services: ReturnType<typeof miniServices>; controller: MiniPublicationController; loaded: boolean; refresh(): Promise<void>; settings(): void; resizeContent(): void }
const status = (id: string, pending = false, published = false): PublicationStatus => ({ workId: id, articleId: id,
  version: 1, settings: { version: 0, assetId: null, crops: null }, published, reason: '', lastSubmission: null,
  pending: pending ? { id: 'pending-' + id, state: 'pending', reason: '', createdAt: '2026-09-07' } : null });

describe('客户端作品管理与发表阶段', () => {
  it('资料键盘可用高度不足时聚焦用户名，收起键盘恢复完整资料', async () => {
    for (const height of [640, 844, 932]) {
      vi.stubGlobal('wx', { getWindowInfo: () => ({ windowWidth: 360, windowHeight: height }) });
      const page = await capture<PageState & { nameKeyboard(event: object): void }>(() => import('../miniprogram/pages/profile/index'));
      page.setData({ navigationHeight: 80 });
      page.nameKeyboard({ detail: { height: 260 } });
      expect(page.data.compactProfile).toBe(height === 640);
      page.nameKeyboard({ detail: { height: 0 } });
      expect(page.data.compactProfile).toBe(false);
    }
  });

  it('筛选保留重审中的旧公开版，未知状态不冒充草稿，回收站保持独立', async () => {
    const drafts = ['draft', 'review', 'public', 'recycle'].map(title => ({ ...emptyDraft(), id: title, title, textDraft: '正文' }));
    const works = drafts.map(draft => ({ ...workFromDraft(draft), deletedAt: draft.id === 'recycle' ? '2026-09-07' : null }));
    const statuses = vi.fn(async () => ({ publications: [status('review', true, true), status('public', false, true)] }));
    context.services = { writer: { flush: async () => {} }, repository: { load: async () => ({ works, issues: [] }) }, publications: { statuses },
      sync: { subscribe: () => () => {}, snapshot: () => ({ error: '' }) } } as unknown as ReturnType<typeof miniServices>;
    const page = await capture<WorkPage>(() => import('../miniprogram/components/author-articles/index'));
    await page.refresh(false);
    const ids = () => (page.data.visible as Array<{ id: string }>).map(item => item.id);
    expect(ids()).toEqual(['draft', 'review', 'public']);
    page.selectFilter({ currentTarget: { dataset: { filter: 'published' } } });
    expect(ids()).toEqual(['review', 'public']);
    page.selectFilter({ currentTarget: { dataset: { filter: 'pending' } } }); expect(ids()).toEqual(['review']);
    page.selectFilter({ currentTarget: { dataset: { filter: 'draft' } } }); expect(ids()).toEqual(['draft']);
    statuses.mockRejectedValueOnce(new Error('offline')); await page.refresh(false);
    expect(ids()).toEqual([]); expect(page.data.empty).toBe(true); expect(page.data.statusUnavailable).toBe(true);
    expect((page.data.cards as Array<{ publication: string }>).every(item => item.publication === '发表状态暂未更新')).toBe(true);
    page.setData({ recycle: true, manage: true }); page.toggleManage(); page.filterCards();
    expect(page.data.recycle).toBe(true); expect(ids()).toEqual(['recycle']);
  });

  it.each([{ pending: true, published: false, mode: 'review' }, { pending: true, published: true, mode: 'review' }, { pending: false, published: true, mode: 'preview' }])('重开稿件时按真实状态展示 $mode（待审 $pending，已发表 $published）', async expected => {
    const draft = { ...emptyDraft(), title: '同一篇文章', textDraft: '正文' };
    const saved = { ...emptyPublicationDraft(draft.id), path: '/cover', width: 640, height: 480 };
    const current = status(draft.id, expected.pending, expected.published);
    context.services = { repository: { getAggregate: async () => ({ work: workFromDraft(draft) }) },
      account: { snapshot: () => ({ account: { nickname: '作者' } }) }, sync: { sync: async () => {} },
      publications: { status: async () => current, submission: async () => ({ id: 'submitted', title: '投稿时标题', body: '投稿时正文', authorName: '投稿时署名', assetId: 'cover', createdAt: '2026-09-08' }), ownImage: async () => new ArrayBuffer(0) }, publicationStorage: { cacheImage: async () => '/submitted-cover' } } as unknown as ReturnType<typeof miniServices>;
    const page = await capture<PublishPage>(() => import('../miniprogram/pages/publish/index'));
    page.services = context.services; page.loaded = true;
    page.controller = { workId: draft.id, local: async () => saved } as unknown as MiniPublicationController;
    await page.refresh();
    expect(page.data).toMatchObject({ mode: expected.mode, status: current, title: draft.title, error: '' });
    expect((page.data.draft as typeof saved).path).toBe('/cover');
  });

  it.each([360, 390, 430])('在 %i 宽度下预览与裁切使用实际边距和窗口高度', async width => {
    vi.stubGlobal('wx', { getWindowInfo: () => ({ windowWidth: width, windowHeight: 560 }) });
    const page = await capture<PublishPage>(() => import('../miniprogram/pages/publish/index'));
    page.resizeContent();
    expect(page.data.viewportWidth).toBe(width - (width <= 370 ? 40 : 48));
    expect(page.data.cropWidth).toBeLessThanOrEqual(Number(page.data.viewportWidth));
    expect(Number(page.data.cropWidth)).toBeGreaterThanOrEqual(160);
  });
  it('我的文章分页保持二十篇，切换筛选从第一页开始', async () => {
    const works = Array.from({ length: 43 }, (_, i) => workFromDraft({ ...emptyDraft(), id: 'work-' + i, title: '文章' + i }));
    context.services = { writer: { flush: async () => {} }, repository: { load: async () => ({ works, issues: [] }) }, publications: { statuses: async () => ({ publications: [] }) }, sync: { subscribe: () => () => {}, snapshot: () => ({ error: '' }) } } as unknown as ReturnType<typeof miniServices>;
    const page = await capture<WorkPage>(() => import('../miniprogram/components/author-articles/index'));
    await page.refresh(false); expect(page.data.visible).toHaveLength(20); expect(page.data.total).toBe(43);
    page.more(); expect(page.data.visible).toHaveLength(40);
    page.selectFilter({ currentTarget: { dataset: { filter: 'draft' } } }); expect(page.data.visible).toHaveLength(20);
  });
  it('删除空正文作品使用合法确认文字，弹窗失败被捕获且取消不调用删除', async () => {
    const work = workFromDraft({ ...emptyDraft(), id: 'empty-work', title: '空正文' });
    const lifecycle = vi.fn();
    context.services = { writer: { flush: async () => {} }, repository: { load: async () => ({ works: [work], issues: [] }) }, publications: { statuses: async () => ({ publications: [] }) }, sync: { lifecycle, subscribe: () => () => {}, snapshot: () => ({ error: '' }) } } as unknown as ReturnType<typeof miniServices>;
    const showModal = vi.fn(async (options: { confirmText: string }) => { if (options.confirmText.length > 4) throw new Error('confirmText too long'); return { confirm: true }; }); vi.stubGlobal('wx', { showModal });
    const page = await capture<WorkPage>(() => import('../miniprogram/components/author-articles/index')); await page.refresh(false);
    const event = { currentTarget: { dataset: { id: work.id, revision: work.revision } } };
    await page.moveToRecycle(event); expect(showModal.mock.calls[0]![0].confirmText.length).toBeLessThanOrEqual(4);
    expect(lifecycle).toHaveBeenCalledWith(work.id, 'trash', work.revision);
    lifecycle.mockClear(); showModal.mockResolvedValueOnce({ confirm: false }); await page.moveToRecycle(event); expect(lifecycle).not.toHaveBeenCalled();
    showModal.mockRejectedValueOnce(new Error('弹窗暂不可用')); await page.moveToRecycle(event); expect(page.data.issue).toContain('弹窗暂不可用'); expect(page.data.deleting).toBe(false); expect(page.data.visible).toHaveLength(1);
  });
  it('删除确认期间切换账号，不对任何账号执行旧删除', async () => {
    const lifecycle = vi.fn(); const services = { writer: { flush: async () => {} }, repository: { load: async () => ({ works: [], issues: [] }) }, publications: { statuses: async () => ({ publications: [] }) }, sync: { lifecycle, subscribe: () => () => {}, snapshot: () => ({ error: '' }) } } as unknown as ReturnType<typeof miniServices>;
    context.services = services;
    vi.stubGlobal('wx', { showModal: async () => { context.services = {} as ReturnType<typeof miniServices>; return { confirm: true }; } });
    const page = await capture<WorkPage>(() => import('../miniprogram/components/author-articles/index')); await page.refresh(false);
    await page.moveToRecycle({ currentTarget: { dataset: { id: 'old-account-work', revision: 1 } } }); expect(lifecycle).not.toHaveBeenCalled();
  });

});
