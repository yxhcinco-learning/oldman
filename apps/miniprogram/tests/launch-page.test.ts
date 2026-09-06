import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ state: { status: 'guest', account: null as { id: string } | null }, restore: vi.fn(), clear: vi.fn() }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => ({ account: { snapshot: () => fixture.state, restore: fixture.restore } }) }));
vi.mock('../miniprogram/auth/navigation', () => ({ clearLoginReturn: fixture.clear }));

async function page() {
  vi.resetModules();
  let definition!: { enter(): Promise<void>; onUnload(): void; alive: boolean };
  vi.stubGlobal('Page', (value: typeof definition) => { definition = value; });
  await import('../miniprogram/pages/launch/index');
  return definition;
}

beforeEach(() => {
  vi.useFakeTimers();
  fixture.restore.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('wx', { reLaunch: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['guest', 'expired', 'replaced', 'authenticated', 'offline'])('开屏根据 %s 分流，保留品牌展示且不换码', async status => {
  fixture.state = { status, account: status === 'guest' ? null : { id: 'a' } };
  const launch = await page();
  const entering = launch.enter();
  await vi.advanceTimersByTimeAsync(499);
  expect(wx.reLaunch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await entering;
  expect(wx.reLaunch).toHaveBeenCalledWith({ url: ['authenticated', 'offline'].includes(status) ? '/pages/home/index' : '/pages/login/index' });
});

it('慢网络不困在开屏，恢复已有离线账号后进入首页', async () => {
  fixture.state = { status: 'offline', account: { id: 'a' } };
  fixture.restore.mockReturnValue(new Promise(() => {}));
  const entering = (await page()).enter();
  await vi.advanceTimersByTimeAsync(1200);
  await entering;
  expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/home/index' });
});

it('开屏销毁后的恢复结果不能跳走用户当前页面', async () => {
  const launch = await page();
  const entering = launch.enter();
  launch.onUnload();
  await vi.advanceTimersByTimeAsync(1200);
  await entering;
  expect(wx.reLaunch).not.toHaveBeenCalled();
});
