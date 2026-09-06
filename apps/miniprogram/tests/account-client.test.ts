import { describe, expect, it } from 'vitest';
import { MiniAccountClient, type AccountPlatform, type StoredAccountSession } from '../miniprogram/auth/account-client';

const account = { id: 'account-a', nickname: '', avatarVersion: 0, hasAvatar: false, expiresAt: '2099-01-01T00:00:00.000Z' };
const token = 'a'.repeat(43);
describe('主动账号登录状态', () => {
  it('游客不自动登录，单飞登录后遇到被替换不重试业务或换码', async () => {
    let logins = 0, calls = 0;
    const platform: AccountPlatform = { login: async () => { logins++; return 'code'; }, request: async () => ({ statusCode: 200, data: { token, account } }) };
    const client = new MiniAccountClient(platform, { read: async () => undefined, write: async () => {}, clear: async () => {} });
    await client.restore();
    expect(logins).toBe(0);
    await expect(client.authorizedRequest(async () => ({ statusCode: 200, data: null }))).rejects.toThrow('登录');
    await Promise.all([client.login(), client.login()]);
    expect(logins).toBe(1);
    await client.authorizedRequest(async () => { calls++; return { statusCode: 401, data: { code: 'session_replaced' } }; });
    expect(client.snapshot().status).toBe('replaced');
    await expect(client.authorizedRequest(async () => { calls++; return { statusCode: 200, data: null }; })).rejects.toThrow('登录');
    expect(calls).toBe(1); expect(logins).toBe(1);
  });

  it('退出与登录记录在途写入串行，不能在退出后恢复旧 token', async () => {
    let value: StoredAccountSession | undefined;
    let release: () => void = () => {};
    let writing: () => void = () => {};
    const began = new Promise<void>(resolve => { writing = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const client = new MiniAccountClient({ login: async () => 'code', request: async () => ({ statusCode: 200, data: { token, account } }) }, {
      read: async () => value, write: async next => { writing(); await gate; value = next; }, clear: async () => { value = undefined; },
    });
    const signingIn = client.login();
    await began;
    const signingOut = client.logout();
    expect(client.snapshot().account).toBeNull();
    release(); await signingIn; await signingOut;
    expect(value).toBeUndefined(); expect(client.snapshot().status).toBe('guest');
  });

  it('旧账号绑定的在线调用不能取得新账号凭据', async () => {
    const client = new MiniAccountClient({ login: async () => 'code', request: async () => ({ statusCode: 200, data: { token, account } }) }, {
      read: async () => undefined, write: async () => {}, clear: async () => {},
    });
    await client.login();
    const bound = client.bound(client.snapshot().generation, account.id);
    await client.logout(); await client.login();
    let dispatched = false;
    await expect(bound.authorizedRequest(async () => { dispatched = true; return { statusCode: 200, data: null }; })).rejects.toThrow('账号已变化');
    expect(dispatched).toBe(false);
  });
});
