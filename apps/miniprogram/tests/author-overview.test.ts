import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, workFromDraft, type Work, type PublicationStatus } from '../miniprogram/domain/core';
import { authorOverview, selectAuthorArticles } from '../miniprogram/ui/author-library';
import type { miniServices } from '../miniprogram/services';

const owner = vi.hoisted(() => ({ services: {} as ReturnType<typeof miniServices> }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => owner.services }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const draft = (id: string, updatedAt = '2026-09-08T08:00:00Z'): Work => ({ ...workFromDraft({ ...emptyDraft(), id, title: id, inputMode: 'text', textDraft: '确认过的正文', pendingVoice: '未确认的私有声音' }), updatedAt });
const publication = (id: string, pending = false): PublicationStatus => ({ workId: id, articleId: 'public-' + id, published: true, pending: pending ? { id: 'pending', state: 'pending', createdAt: '', reason: '' } : null, version: 1, settings: { version: 0, assetId: null, crops: null }, lastSubmission: null, reason: '' });
interface Card { id: string; title: string; url: string; action: string; category: string; excerpt: string; publication: string }
interface Library {
  data: { embedded: boolean; recycle: boolean; query: string; filter: string; limit: number; cards: Card[]; visible: Card[]; recentDraft: Card | null; recentCards: Card[]; total: number; empty: boolean; issue: string; deleting: boolean };
  setData(value: object): void; triggerEvent: ReturnType<typeof vi.fn>; refresh(connect?: boolean): Promise<void>;
  filterCards(): void; searchArticles(event: object): void; selectFilter(event: object): void; more(): void;
  openMenu(event: object): Promise<void>; permanentlyDelete(event: object): Promise<void>;
}
async function loadLibrary(embedded = false) {
  vi.resetModules(); let definition!: { data: object; methods: object };
  vi.stubGlobal('Component', (value: typeof definition) => { definition = value; });
  await import('../miniprogram/components/author-articles/index');
  return { ...definition.methods, data: { recycle: false, embedded, ...structuredClone(definition.data) }, triggerEvent: vi.fn(),
    setData(value: object) { Object.assign(this.data, value); } } as Library;
}
function services(works: Work[], statuses: PublicationStatus[] = []) {
  const instance = { writer: { flush: vi.fn(async () => {}) }, repository: { load: vi.fn(async () => ({ works, aggregates: works.map(work => ({ work, session: null })), issues: [] })) },
    sync: { subscribe: () => () => {}, snapshot: () => ({ error: '' }), sync: async () => {}, lifecycle: vi.fn(async () => {}) },
    publications: { statuses: vi.fn(async () => ({ publications: statuses })), submission: vi.fn() }, publicationStorage: { load: async () => ({ dirty: false }) } };
  owner.services = instance as unknown as ReturnType<typeof miniServices>; return instance;
}

describe('方案 05 个人中心摘要与独立文章管理', () => {
  it('最近草稿按更新时间选择，摘要不重复本人草稿且不展示已删除文章', () => {
    const card = (id: string, category: 'draft' | 'published' | 'unknown', updatedAt: string, extra = {}) => ({ id, title: id, category, updatedAt, deleted: false, published: category === 'published', recovery: false, ...extra });
    const overview = authorOverview([card('older', 'draft', '2026-09-01'), card('latest', 'draft', '2026-09-08'), card('public', 'published', '2026-09-07'), card('deleted', 'draft', '2026-09-09', { deleted: true }), card('recovery', 'draft', '2026-09-06', { recovery: true })]);
    expect(overview.total).toBe(4); expect(overview.published).toBe(1); expect(overview.draft?.id).toBe('latest'); expect(overview.recent.map(c => c.id)).toEqual(['public', 'recovery']);
    expect(authorOverview([card('unknown', 'unknown', '2026-09-08')]).draft).toBeNull();
  });
  it('搜索按真实标题兼容全角和大小写，同时保留状态与回收站边界', () => {
    const cards = [{ id: 'a', title: '我的 ABC 文章', category: 'pending' as const, updatedAt: '', deleted: false, recovery: false, published: true }, { id: 'b', title: '我的 ABC 草稿', category: 'draft' as const, updatedAt: '', deleted: false, recovery: false, published: false }, { id: 'c', title: 'ABC 删除稿', category: 'draft' as const, updatedAt: '', deleted: true, recovery: false, published: false }];
    expect(selectAuthorArticles(cards, false, 'published', ' ａｂｃ ').map(c => c.id)).toEqual(['a']);
    expect(selectAuthorArticles(cards, false, 'draft', 'ABC').map(c => c.id)).toEqual(['b']);
    expect(selectAuthorArticles(cards, true, 'published', 'abc').map(c => c.id)).toEqual(['c']);
  });
  it('摘要只取确认正文，未确认语音不会进入个人中心摘要', async () => {
    services([draft('older', '2026-09-01'), draft('latest', '2026-09-08'), draft('public', '2026-09-07')], [publication('public')]);
    const library = await loadLibrary(true); await library.refresh(false);
    expect(library.data.recentDraft?.id).toBe('latest'); expect(library.data.recentCards.map(c => c.id)).toEqual(['public', 'older']);
    expect(library.data.cards.every(c => c.excerpt === '确认过的正文')).toBe(true);
    expect(library.triggerEvent).toHaveBeenCalledWith('summary', { total: 3, published: 1, statusKnown: true });
  });
  it('完整文章搜索与状态筛选都重置分页，待审改稿和公开旧版只计一篇', async () => {
    services(Array.from({ length: 43 }, (_, i) => draft('文章' + i)), [publication('文章1', true)]);
    const library = await loadLibrary(); await library.refresh(false); library.more(); expect(library.data.visible).toHaveLength(40);
    library.searchArticles({ detail: { value: '文章1' } }); expect(library.data.limit).toBe(20); expect(library.data.visible).toHaveLength(11);
    library.selectFilter({ currentTarget: { dataset: { filter: 'published' } } }); expect(library.data.visible.map(c => c.id)).toEqual(['文章1']);
    expect(library.data.total).toBe(43); library.searchArticles({ detail: { value: '不存在' } }); expect(library.data.empty).toBe(true);
  });
  it('发表状态失败不把文章当成草稿，个人中心仍能进入所有文章', async () => {
    const s = services([draft('private')]); s.publications.statuses.mockRejectedValueOnce(new Error('offline'));
    const library = await loadLibrary(true); await library.refresh(false);
    expect(library.data.recentDraft).toBeNull(); expect(library.data.recentCards[0]).toMatchObject({ category: 'unknown', publication: '发表状态暂未更新' });
    expect(library.triggerEvent).toHaveBeenCalledWith('summary', { total: 1, published: 0, statusKnown: false });
  });
  it('已发表稿件核对失败时，摘要和完整行同时回退编辑入口', async () => {
    const status = { ...publication('published'), lastSubmission: { id: 'approved', state: 'approved' as const, reason: '', createdAt: '' } };
    const s = services([draft('published')], [status]); s.publications.submission.mockRejectedValue(new Error('offline'));
    const library = await loadLibrary(true); await library.refresh(false);
    await vi.waitFor(() => { expect(library.data.recentCards[0]?.action).toBe('编辑文章'); });
    expect(library.data.cards[0]?.url).toBe('/pages/editor/index?id=published'); expect(library.data.visible[0]?.url).toBe('/pages/editor/index?id=published');
  });
  it('单篇更多菜单取消不删除，账号变化后旧选择不执行', async () => {
    const s = services([draft('one')]); const library = await loadLibrary(); await library.refresh(false);
    const event = { currentTarget: { dataset: { id: 'one', revision: 1 } } };
    vi.stubGlobal('wx', { showActionSheet: async () => { throw { errMsg: 'showActionSheet:fail cancel' }; } });
    await library.openMenu(event); expect(library.data.issue).toBe(''); expect(s.sync.lifecycle).not.toHaveBeenCalled();
    vi.stubGlobal('wx', { showActionSheet: async () => { owner.services = {} as ReturnType<typeof miniServices>; return { tapIndex: 1 }; } });
    await library.openMenu(event); expect(s.sync.lifecycle).not.toHaveBeenCalled();
  });
  it('永久删除确认失败保留回收站记录，操作期间换账号不执行旧删除', async () => {
    const s = services([{ ...draft('deleted'), deletedAt: '2026-09-08' }]); const library = await loadLibrary(); library.setData({ recycle: true }); await library.refresh(false);
    const event = { currentTarget: { dataset: { id: 'deleted', revision: 1 } } };
    vi.stubGlobal('wx', { showModal: async () => { throw new Error('确认暂不可用'); } });
    await library.permanentlyDelete(event); expect(library.data.issue).toContain('确认暂不可用'); expect(library.data.deleting).toBe(false); expect(library.data.visible).toHaveLength(1);
    vi.stubGlobal('wx', { showModal: async () => { owner.services = {} as ReturnType<typeof miniServices>; return { confirm: true }; } });
    await library.permanentlyDelete(event); expect(s.sync.lifecycle).not.toHaveBeenCalled();
  });
});
