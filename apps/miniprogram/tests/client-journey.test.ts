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
  await load();
  return { ...definition, data: structuredClone(definition.data), setData(value: object) { Object.assign(this.data, value); } } as T;
}
interface WorkPage extends PageState { refresh(connect?: boolean): Promise<void>; selectFilter(event: object): void; finishManage(): void }
interface PublishPage extends PageState { services: ReturnType<typeof miniServices>; controller: MiniPublicationController; refresh(): Promise<void>; settings(): void; resizeContent(): void }
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
    const page = await capture<WorkPage>(() => import('../miniprogram/pages/works/index'));
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
    page.setData({ recycle: true, manage: true }); page.finishManage();
    expect(page.data.recycle).toBe(true); expect(ids()).toEqual(['recycle']);
  });

  it.each([{ pending: true, published: false, mode: 'result' }, { pending: true, published: true, mode: 'result' }, { pending: false, published: true, mode: 'settings' }])('重开稿件时按真实状态展示 $mode（待审 $pending，已发表 $published）', async expected => {
    const draft = { ...emptyDraft(), title: '同一篇文章', textDraft: '正文' };
    const saved = { ...emptyPublicationDraft(draft.id), path: '/cover', width: 640, height: 480 };
    const current = status(draft.id, expected.pending, expected.published);
    context.services = { repository: { getAggregate: async () => ({ work: workFromDraft(draft) }) },
      account: { snapshot: () => ({ account: { nickname: '作者' } }) }, sync: { sync: async () => {} },
      publications: { status: async () => current } } as unknown as ReturnType<typeof miniServices>;
    const page = await capture<PublishPage>(() => import('../miniprogram/pages/publish/index'));
    page.services = context.services;
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
    expect(Number(page.data.cropWidth)).toBeGreaterThanOrEqual(200);
  });
});
