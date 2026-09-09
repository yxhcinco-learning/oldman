import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniAccountClient, type StoredAccountSession } from '../miniprogram/auth/account-client';
import { MiniPublicationClient } from '../miniprogram/publication/client';
import { emptyDraft, workFromDraft, type Work } from '../miniprogram/domain/core';
import type { miniServices } from '../miniprogram/services';
import type { SyncState } from '../miniprogram/sync/controller';

const context = vi.hoisted(() => ({ services: {} as ReturnType<typeof miniServices> }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => context.services }));
vi.mock('../miniprogram/auth/page', () => ({ accountPage: (value: object) => Page(value) }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({ navigationHeight: 80 }) }));
vi.mock('../miniprogram/ui/tab-bar', () => ({ selectTab() {}, setTabBarHidden() {} }));

interface Library {
  data: { recycle: boolean; cards: Array<{ id: string; publication: string }>; visible: object[]; statusUnavailable: boolean; loading: boolean; issue: string };
  setData(value: object): void; triggerEvent(): void;
  refresh(connect?: boolean, changed?: boolean): Promise<void>; moveToRecycle(event: object): Promise<void>; restore(event: object): Promise<void>; permanentlyDelete(event: object): Promise<void>;
}
interface Definition { data: object; methods: object; lifetimes: { attached(this: Library): void; detached(this: Library): void }; pageLifetimes: { show(this: Library): void; hide(this: Library): void } }
interface Profile { data: object; onLoad(): void; onShow(): void; onHide(): void; onUnload(): void; refreshState(): Promise<void>; setData(value: object): void }
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

async function services(worksCount = 1) {
  const accountRecord = { id: 'isolated-account', nickname: '隔离作者', avatarVersion: 0, hasAvatar: false, expiresAt: '2099-01-01T00:00:00.000Z' };
  const storage = { read: async (): Promise<StoredAccountSession> => ({ version: 2, token: 'a'.repeat(43), account: accountRecord }), write: async () => {}, clear: async () => {} };
  const publicationResponse = vi.fn(async (): Promise<{ statusCode: number; data: unknown }> => ({ statusCode: 200, data: { publications: [] } }));
  const accountRequest = vi.fn(async () => ({ statusCode: 200, data: accountRecord }));
  const platform = { login: async () => 'isolated', request: (path: string) => path === '/api/mini/publications' ? publicationResponse() : accountRequest() };
  const account = new MiniAccountClient(platform, storage); await account.restore();
  const listeners = new Set<(state: SyncState) => void>(); let state: SyncState = { status: 'ready', error: '' };
  const publish = (status: SyncState['status'], error = '') => { state = { status, error }; listeners.forEach(listener => listener(state)); };
  const sync = { subscribe: (listener: (value: SyncState) => void) => { listeners.add(listener); return () => listeners.delete(listener); }, snapshot: () => state,
    sync: vi.fn(async () => {}), lifecycle: vi.fn<(id: string, kind: string, revision: number) => Promise<void>>(async () => {}) };
  cleanup.push(account.subscribe(value => { if (value.status !== 'authenticated') publish('paused', value.error); }));
  let works = Array.from({ length: worksCount }, (_, i) => workFromDraft({ ...emptyDraft(), id: 'isolated-' + i, title: '隔离稿件' }));
  const repository = { load: vi.fn(async () => ({ works: [...works], issues: [] })), allAggregates: vi.fn(async () => []), paths: { root: '/isolated' } };
  const writer = { flush: vi.fn(async () => {}) };
  const publications = new MiniPublicationClient(account.bound(account.snapshot().generation, accountRecord.id), platform);
  const social = { summary: vi.fn(async () => ({ publicAuthorId: 'public-author', following: 0, followers: 0, mutuals: 0 })), wallet: vi.fn(async () => ({ balance: 3, version: 1, today: '2026-09-09', claimedToday: true, dailyAmount: 3 })) };
  const result = { account, writer, repository, publications, sync, social };
  context.services = result as unknown as ReturnType<typeof miniServices>;
  return { ...result, publicationResponse, publish, accountRequest, setWorks(value: Work[]) { works = value; } };
}

async function libraries(count = 1) {
  vi.resetModules(); let definition!: Definition;
  vi.stubGlobal('Component', (value: Definition) => { definition = value; });
  await import('../miniprogram/components/author-articles/index');
  const instances: Library[] = [];
  for (let i = 0; i < count; i++) {
    const instance = { ...definition.methods, data: { recycle: false, embedded: i === 0, ...structuredClone(definition.data) }, triggerEvent() {},
      setData(value: object) { Object.assign(this.data, value); } } as Library;
    definition.lifetimes.attached.call(instance); definition.pageLifetimes.show.call(instance);
    cleanup.push(() => definition.lifetimes.detached.call(instance)); instances.push(instance);
    await instance.refresh();
  }
  return { instances, hide: (index = 0) => definition.pageLifetimes.hide.call(instances[index]!), show: (index = 0) => definition.pageLifetimes.show.call(instances[index]!) };
}

describe('作者列表可见性与合并刷新', () => {
  it.each([1, 80])('%i 篇作品的账号核对与同步中间态不查询，终态只查询一次', async count => {
    const s = await services(count); const { instances } = await libraries();
    expect(s.sync.sync).toHaveBeenCalledTimes(1); expect(s.publicationResponse).toHaveBeenCalledTimes(1);
    s.publicationResponse.mockClear();
    s.publish('syncing'); await s.account.refresh(); await s.account.refresh(); await settle();
    expect(s.publicationResponse).not.toHaveBeenCalled();
    s.publish('ready'); await instances[0]!.refresh(false);
    expect(s.publicationResponse).toHaveBeenCalledTimes(1);
    s.publish('ready'); await settle(); expect(s.publicationResponse).toHaveBeenCalledTimes(1);
  });

  it('完整列表后面的个人中心停止请求，返回再同步最新状态', async () => {
    const s = await services(80); const pages = await libraries(2); pages.hide(0); s.publicationResponse.mockClear(); s.sync.sync.mockClear();
    const statuses = vi.spyOn(s.publications, 'statuses'); s.repository.load.mockClear();
    s.publish('syncing'); await s.account.refresh(); s.publish('ready'); await pages.instances[1]!.refresh(false);
    expect(s.publicationResponse).toHaveBeenCalledTimes(1); expect(statuses).toHaveBeenCalledTimes(1); expect(s.repository.load).toHaveBeenCalledTimes(1);
    pages.show(0); await pages.instances[0]!.refresh();
    expect(s.publicationResponse).toHaveBeenCalledTimes(2); expect(statuses).toHaveBeenCalledTimes(2); expect(s.sync.sync).toHaveBeenCalledTimes(1);
  });

  it('同页在途刷新合并，隐藏后的迟到结果不写回且重新显示重新读取', async () => {
    const s = await services(); const pages = await libraries(); const instance = pages.instances[0]!;
    const response = gate<{ statusCode: number; data: unknown }>(); s.publicationResponse.mockClear(); s.publicationResponse.mockReturnValueOnce(response.promise);
    const first = instance.refresh(false), second = instance.refresh(false);
    expect(second).toBe(first); await settle(); expect(s.publicationResponse).toHaveBeenCalledTimes(1);
    pages.hide(); const data = structuredClone(instance.data);
    response.resolve({ statusCode: 200, data: { publications: [] } }); await first;
    expect(instance.data).toEqual(data);
    s.publish('syncing'); s.publish('ready'); await s.account.refresh(); await instance.refresh(); await settle();
    expect(s.publicationResponse).toHaveBeenCalledTimes(1);
    pages.show(); await instance.refresh(); expect(s.publicationResponse).toHaveBeenCalledTimes(2);
  });

  it('隐藏发生在本机保存期间时不再开始联网读取', async () => {
    const s = await services(); const pages = await libraries(); const flush = gate<void>();
    s.writer.flush.mockReturnValueOnce(flush.promise); s.publicationResponse.mockClear(); s.sync.sync.mockClear();
    const flight = pages.instances[0]!.refresh(); pages.hide(); flush.resolve(); await flight;
    expect(s.publicationResponse).not.toHaveBeenCalled(); expect(s.sync.sync).not.toHaveBeenCalled();
  });

  it('网络失败没有离线通知反馈循环，主动重新连接后清除未知状态', async () => {
    const s = await services(); const { instances } = await libraries(); const instance = instances[0]!;
    s.publicationResponse.mockClear(); s.publicationResponse.mockRejectedValueOnce(new Error('isolated network failure'));
    await instance.refresh(false); await settle();
    expect(s.publicationResponse).toHaveBeenCalledTimes(1); expect(instance.data.statusUnavailable).toBe(true);
    expect(instance.data.cards[0]?.publication).toBe('发表状态暂未更新');
    s.sync.sync.mockImplementationOnce(async () => { s.publish('syncing'); await s.account.refresh(); s.publish('ready'); });
    await instance.refresh();
    expect(s.publicationResponse).toHaveBeenCalledTimes(2); expect(instance.data.statusUnavailable).toBe(false); expect(instance.data.issue).toBe('');
  });

  it('HTML限流错误保留作品和未知状态，不重试或伪造草稿', async () => {
    const s = await services(); const { instances } = await libraries(); s.publicationResponse.mockClear();
    s.publicationResponse.mockResolvedValueOnce({ statusCode: 429, data: '<html>Too Many Requests</html>' });
    await instances[0]!.refresh(false); await settle();
    expect(s.publicationResponse).toHaveBeenCalledTimes(1); expect(instances[0]!.data.cards).toHaveLength(1);
    expect(instances[0]!.data.statusUnavailable).toBe(true); expect(instances[0]!.data.cards[0]?.publication).toBe('发表状态暂未更新');
    expect(instances[0]!.data.issue).toContain('频繁');
  });

  it('删除期间旧刷新未返回，也必须读到删除完成后的目录', async () => {
    const s = await services(); const { instances } = await libraries(); const instance = instances[0]!;
    const response = gate<{ statusCode: number; data: unknown }>(); s.publicationResponse.mockReturnValueOnce(response.promise);
    const oldRefresh = instance.refresh(false); await settle();
    vi.stubGlobal('wx', { showModal: async () => ({ confirm: true }) });
    s.sync.lifecycle.mockImplementationOnce(async () => { s.setWorks([]); });
    const deleting = instance.moveToRecycle({ currentTarget: { dataset: { id: 'isolated-0', revision: 1 } } }); await settle();
    response.resolve({ statusCode: 200, data: { publications: [] } }); await Promise.all([oldRefresh, deleting]);
    expect(s.sync.lifecycle).toHaveBeenCalledTimes(1); expect(instance.data.cards).toEqual([]); expect(instance.data.visible).toEqual([]);
  });

  it.each([
    ['trash', 'moveToRecycle'], ['restore', 'restore'], ['purge', 'permanentlyDelete'],
  ] as const)('%s 已确认且同步就绪后不再为界面启动完整同步', async (kind, method) => {
    const s = await services(); const { instances } = await libraries(); const instance = instances[0]!;
    const before = { ...workFromDraft({ ...emptyDraft(), id: 'isolated-0', title: '隔离文章' }), deletedAt: kind === 'trash' ? null : '2026-09-08T00:00:00Z' };
    s.setWorks([before]); instance.data.recycle = kind !== 'trash'; await instance.refresh(false);
    s.sync.sync.mockClear(); s.publicationResponse.mockClear();
    s.sync.lifecycle.mockImplementationOnce(async () => { s.setWorks(kind === 'purge' ? [] : [{ ...before, deletedAt: kind === 'trash' ? '2026-09-08T00:00:00Z' : null }]); });
    vi.stubGlobal('wx', { showModal: async () => ({ confirm: true }) });
    await instance[method]({ currentTarget: { dataset: { id: before.id, revision: before.revision } } });
    expect(s.sync.lifecycle).toHaveBeenCalledWith(before.id, kind, before.revision);
    expect(s.sync.sync).not.toHaveBeenCalled(); expect(instance.data.visible).toEqual([]); expect(instance.data.issue).toBe('');
    expect(s.publicationResponse).toHaveBeenCalledTimes(kind === 'trash' ? 1 : 0);
  });

  it('回收站不依赖发表查询，但仍显示真实同步失败', async () => {
    const s = await services(); const { instances } = await libraries(); const instance = instances[0]!;
    instance.data.recycle = true; s.publicationResponse.mockClear(); s.publicationResponse.mockRejectedValue(new Error('无关发表服务失败'));
    s.publish('error', '请求较频繁，请稍后重试。'); await instance.refresh(false);
    expect(s.publicationResponse).not.toHaveBeenCalled(); expect(instance.data.statusUnavailable).toBe(false);
    expect(instance.data.issue).toContain('请求较频繁');
  });

  it('删除成功但既有同步失败时仍重试同步并清除恢复后的错误', async () => {
    const s = await services(); const { instances } = await libraries(); const instance = instances[0]!;
    s.publish('error', '请求较频繁，请稍后重试。'); await instance.refresh(false); s.sync.sync.mockClear();
    s.sync.lifecycle.mockImplementationOnce(async () => { s.setWorks([]); });
    s.sync.sync.mockImplementationOnce(async () => { s.publish('syncing'); s.publish('ready'); });
    vi.stubGlobal('wx', { showModal: async () => ({ confirm: true }) });
    await instance.moveToRecycle({ currentTarget: { dataset: { id: 'isolated-0', revision: 1 } } });
    expect(s.sync.sync).toHaveBeenCalledTimes(1); expect(instance.data.issue).toBe(''); expect(instance.data.cards).toEqual([]);
  });

  it('账号变化立即清除旧卡片，旧在途结果不能覆盖新账号', async () => {
    const old = await services(); const { instances } = await libraries(); const instance = instances[0]!;
    const response = gate<{ statusCode: number; data: unknown }>(); old.publicationResponse.mockReturnValueOnce(response.promise);
    const flight = instance.refresh(false); await settle();
    const next = await services(); next.setWorks([workFromDraft({ ...emptyDraft(), id: 'new-owner-work', title: '新账号文章' })]);
    await old.account.refresh(); expect(instance.data.cards).toEqual([]);
    response.resolve({ statusCode: 200, data: { publications: [] } }); await flight;
    expect(instance.data.cards.map(item => item.id)).toEqual(['new-owner-work']); expect(next.publicationResponse).toHaveBeenCalledTimes(1);
  });

  it('隐藏个人资料页不因账号与同步通知重复读库，返回更新资料', async () => {
    const s = await services(); vi.resetModules(); let definition!: Profile;
    vi.stubGlobal('Page', (value: Profile) => { definition = value; });
    await import('../miniprogram/pages/profile/index');
    const page = { ...definition, data: structuredClone(definition.data), setData(value: object) { Object.assign(this.data, value); } };
    cleanup.push(() => page.onUnload()); page.onLoad(); page.onShow(); await page.refreshState();
    page.onHide(); s.repository.allAggregates.mockClear(); s.accountRequest.mockClear();
    s.publish('syncing'); await s.account.refresh(); s.publish('ready'); await page.refreshState(); await settle();
    expect(s.repository.allAggregates).not.toHaveBeenCalled(); expect(s.accountRequest).toHaveBeenCalledTimes(1);
    page.onShow(); await settle(); expect(s.repository.allAggregates).toHaveBeenCalledTimes(1);
  });
});
