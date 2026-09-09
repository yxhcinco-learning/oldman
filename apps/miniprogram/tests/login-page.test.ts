import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  social: false, accountLogin: vi.fn(), accountRefresh: vi.fn(), prepare: vi.fn(),
  state: { status: 'guest', account: null as { id: string } | null },
  restore: vi.fn(), sync: vi.fn(), login: vi.fn(), refresh: vi.fn(), finish: vi.fn(), clear: vi.fn(),
}));
vi.mock('../miniprogram/services', () => ({ miniServices: () => ({ account: { snapshot: () => fixture.state, restore: fixture.restore, login: fixture.accountLogin, refresh: fixture.accountRefresh }, sync: { sync: fixture.sync } }),
  loginMiniAccount: fixture.login, refreshMiniAccount: fixture.refresh }));
vi.mock('../miniprogram/auth/navigation', () => ({ finishLogin: fixture.finish, hasSocialLoginReturn: () => fixture.social, socialLoginReason: () => '', cancelSocialLogin: fixture.clear, prepareSocialLoginAttempt: fixture.prepare }));

interface LoginPage {
  data: { busy: boolean; error: string; signedIn: boolean; contextual: boolean };
  login(): Promise<void>; cancel(): Promise<void>; skip(): void; onHide(): void; onShow(): void;
  setData(value: Record<string, unknown>): void;
}
async function page() {
  vi.resetModules();
  let definition!: LoginPage;
  vi.stubGlobal('Page', (value: LoginPage) => { definition = value; });
  await import('../miniprogram/pages/login/index');
  return { ...definition, data: { ...definition.data }, setData(value: Record<string, unknown>) { Object.assign(this.data, value); } };
}
beforeEach(() => {
  fixture.social = false; fixture.state = { status: 'guest', account: null };
  for (const mock of [fixture.restore, fixture.sync, fixture.login, fixture.refresh, fixture.finish, fixture.clear, fixture.accountLogin, fixture.accountRefresh, fixture.prepare]) mock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('独立授权登录页', () => {
  it('社交登录以账号成功为准，不等待或重试私有作品同步', async () => {
    fixture.social = true; fixture.sync.mockRejectedValue(new Error('作品同步不可用'));
    fixture.accountLogin.mockImplementation(async () => { fixture.state = {status:'authenticated', account:{id:'account'}}; });
    const login = await page(); await login.login();
    expect(fixture.accountLogin).toHaveBeenCalledOnce(); expect(fixture.sync).not.toHaveBeenCalled(); expect(fixture.login).not.toHaveBeenCalled(); expect(fixture.finish).toHaveBeenCalledOnce();
  });
  it('社交入口已有有效账号不再次换码，离线只核对原会话', async () => {
    fixture.social = true; fixture.state = {status:'authenticated',account:{id:'account'}};
    const login = await page(); await login.login(); expect(fixture.accountLogin).not.toHaveBeenCalled(); expect(fixture.sync).not.toHaveBeenCalled();
    fixture.state = {status:'offline',account:{id:'account'}}; await login.login(); expect(fixture.accountRefresh).toHaveBeenCalledOnce(); expect(fixture.refresh).not.toHaveBeenCalled();
  });
  it('取消仍在进行的社交登录后迟到成功不能强制导航', async () => {
    fixture.social = true; let resolve!:()=>void; fixture.accountLogin.mockReturnValue(new Promise<void>(yes=>{resolve=yes;}));
    const login = await page(); const flight=login.login(); await Promise.resolve(); await login.cancel(); resolve(); await flight;
    expect(fixture.clear).toHaveBeenCalledOnce(); const active=fixture.finish.mock.calls[0][0] as ()=>boolean; expect(active()).toBe(false);
  });
  it('加载不换码，点击失败保留重试，重复点击只发一次', async () => {
    const login = await page();
    expect(fixture.login).not.toHaveBeenCalled();
    let reject!: (error: Error) => void;
    fixture.login.mockReturnValue(new Promise((_, no) => { reject = no; }));
    const first = login.login();
    await Promise.resolve();
    await login.login();
    reject(new Error('网络不可用'));
    await first;
    expect(fixture.login).toHaveBeenCalledOnce();
    expect(fixture.finish).not.toHaveBeenCalled();
    expect(login.data).toMatchObject({ error: '网络不可用', busy: false });
  });
  it('已登录但同步失败仅重试同步，不再次登录接管', async () => {
    const login = await page();
    fixture.login.mockImplementation(async () => { fixture.state = { status: 'authenticated', account: { id: 'a' } }; throw new Error('同步失败'); });
    await login.login();
    expect(login.data).toMatchObject({ signedIn: true, error: '同步失败' });
    await login.login();
    expect(fixture.login).toHaveBeenCalledOnce();
    expect(fixture.sync).toHaveBeenCalledOnce();
    expect(fixture.finish).toHaveBeenCalledOnce();
  });
  it('离线有效账号先恢复原会话，不创建新会话', async () => {
    fixture.state = { status: 'offline', account: { id: 'a' } };
    const login = await page();
    await login.login();
    expect(fixture.refresh).toHaveBeenCalledOnce();
    expect(fixture.login).not.toHaveBeenCalled();
  });
  it('离开又返回时旧异步完成不强制导航', async () => {
    const login = await page();
    let resolve!: () => void;
    fixture.login.mockReturnValue(new Promise<void>(yes => { resolve = yes; }));
    const running = login.login();
    await Promise.resolve();
    login.onHide(); login.onShow();
    resolve(); await running;
    const active = fixture.finish.mock.calls[0][0] as () => boolean;
    expect(active()).toBe(false);
  });
  it('没有跳过登录的事件入口', async () => {
    expect((await page()).skip).toBeUndefined();
  });
});
