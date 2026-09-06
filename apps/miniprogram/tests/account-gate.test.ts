import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ state: { status: 'guest', account: null as { id: string } | null }, restore: vi.fn(), login: vi.fn() }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => ({ account: { snapshot: () => fixture.state, restore: fixture.restore } }) }));
vi.mock('../miniprogram/auth/navigation', () => ({ openLogin: fixture.login }));
import { accountPage } from '../miniprogram/auth/page';

type PageFixture = { data: Record<string, unknown>; route: string; onLoad(query: Record<string, string>): Promise<void>; onShow(): Promise<void>; onHide(): void; onUnload(): void; setData(data: object): void };
function create(preserve?: () => Promise<boolean>) {
  let definition!: PageFixture;
  vi.stubGlobal('Page', (value: PageFixture) => { definition = value; });
  const load = vi.fn(), show = vi.fn(), unload = vi.fn();
  accountPage({ data: { secret: '', readOnly: false }, onLoad: load, onShow: show, onUnload: unload }, preserve);
  const page = { ...definition, route: 'pages/editor/index', data: { ...definition.data }, setData(values: object) { Object.assign(this.data, values); } };
  return { page, load, show, unload };
}
beforeEach(() => {
  fixture.state = { status: 'guest', account: null };
  fixture.restore.mockReset().mockResolvedValue(undefined);
  fixture.login.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it.each(['guest', 'connecting', 'expired', 'replaced'])('%s 的直接路径和返回栈都不能读取或显示产品内容', async status => {
  fixture.state = { status, account: status === 'guest' ? null : { id: 'a' } };
  const { page, load, show } = create();
  await page.onLoad({ id: 'kept' });
  expect(load).not.toHaveBeenCalled();
  expect(page.data.accountReady).toBe(false);
  expect(fixture.login).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/editor/index?id=kept', workId: 'kept' }));
  page.onHide();
  await page.onShow();
  expect(show).not.toHaveBeenCalled();
  expect(fixture.login).toHaveBeenCalledTimes(2);
});

it.each(['authenticated', 'offline'])('已登录账号 %s 可访问，页面只加载一次', async status => {
  fixture.state = { status, account: { id: 'a' } };
  const { page, load, show } = create();
  await page.onLoad({});
  await page.onShow();
  expect(page.data.accountReady).toBe(true);
  expect(load).toHaveBeenCalledOnce();
  expect(show).toHaveBeenCalled();
  expect(fixture.login).not.toHaveBeenCalled();
});

it('恢复未完成时不误判游客，销毁页面后不读取或跳转', async () => {
  let resolve!: () => void;
  fixture.restore.mockReturnValue(new Promise<void>(yes => { resolve = yes; }));
  const { page, load } = create();
  const pending = page.onLoad({});
  expect(page.data.accountReady).toBe(false);
  page.onUnload(); resolve(); await pending;
  expect(load).not.toHaveBeenCalled();
  expect(fixture.login).not.toHaveBeenCalled();
});

it('旧页面失效后先保留输入，写入失败停在只读救援状态', async () => {
  fixture.state = { status: 'authenticated', account: { id: 'a' } };
  const preserve = vi.fn().mockResolvedValue(false);
  const { page } = create(preserve);
  await page.onLoad({});
  page.data.secret = '未能落盘的输入';
  fixture.state.status = 'expired';
  await page.onShow();
  expect(preserve).toHaveBeenCalledOnce();
  expect(page.data).toMatchObject({ readOnly: true, secret: '未能落盘的输入' });
  expect(fixture.login).not.toHaveBeenCalled();
  preserve.mockResolvedValue(true);
  await page.onShow();
  expect(fixture.login).toHaveBeenCalledOnce();
});
