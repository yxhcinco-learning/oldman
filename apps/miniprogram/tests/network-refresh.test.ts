import { describe, expect, it, vi } from 'vitest';
import { MiniAccountClient, type AccountPlatform, type MiniSessionAuthorizer } from '../miniprogram/auth/account-client';
import type { AuthenticatedMiniResponse } from '../miniprogram/auth/client';
import { MiniPublicationClient } from '../miniprogram/publication/client';
import { MiniCloudTransport } from '../miniprogram/network/cloud';

const profile = { id: 'account-a', nickname: '测试作者', avatarVersion: 0, hasAvatar: false, expiresAt: '2099-01-01T00:00:00.000Z' };
const token = 'a'.repeat(43);
const authorizer: MiniSessionAuthorizer = { authorizedRequest: action => action(token) };
const storage = { read: async () => undefined, write: async () => {}, clear: async () => {} };
type Response = AuthenticatedMiniResponse<unknown>;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('账号与发表列表的请求合并', () => {
  it('多项请求同时断网只通知一次离线，恢复后再次断网仍正常通知', async () => {
    const platform: AccountPlatform = { login: async () => 'code', request: async path => ({ statusCode: 200, data: path.endsWith('/login') ? { token, account: profile } : profile }) };
    const account = new MiniAccountClient(platform, storage);
    await account.login();
    const listener = vi.fn(); account.subscribe(listener);
    const fail = () => account.authorizedRequest(async () => { throw new Error('network'); });
    await Promise.allSettled([fail(), fail(), fail()]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(account.snapshot()).toMatchObject({ status: 'offline', error: '网络不可用，云作品暂停编辑。' });
    await account.refresh();
    await expect(fail()).rejects.toThrow('network');
    expect(listener.mock.calls.map(call => call[0].status)).toEqual(['offline', 'authenticated', 'offline']);
  });

  it('多个视图共享在途发表列表，完成后重新读取而非缓存旧状态', async () => {
    const pending = deferred<Response>();
    const request = vi.fn(async () => pending.promise);
    const client = new MiniPublicationClient(authorizer, { login: async () => 'code', request });
    const first = client.statuses(), second = client.statuses();
    expect(first).toBe(second); expect(request).toHaveBeenCalledTimes(1);
    pending.resolve({ statusCode: 200, data: { publications: [] } });
    await first;
    await client.statuses(); expect(request).toHaveBeenCalledTimes(2);
  });

  it('失败在途请求清除，主动重试可以成功，不保留拒绝的Promise', async () => {
    const pending = deferred<Response>();
    const request = vi.fn(async () => pending.promise);
    const client = new MiniPublicationClient(authorizer, { login: async () => 'code', request });
    const first = client.statuses(), second = client.statuses();
    const finished = Promise.allSettled([first, second]);
    pending.reject(new Error('offline')); await finished;
    request.mockImplementation(async () => ({ statusCode: 200, data: { publications: [] } }));
    await expect(client.statuses()).resolves.toEqual({ publications: [] });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('投稿动作成功后不复用此前列表，旧响应完成也不清掉新请求', async () => {
    const old = deferred<Response>(), fresh = deferred<Response>();
    const request = vi.fn(async (path: string) => path.endsWith('/actions') ? { statusCode: 200, data: { version: 2 } } : old.promise);
    const client = new MiniPublicationClient(authorizer, { login: async () => 'code', request });
    const first = client.statuses();
    await client.action('work-a', { operationId: 'operation-a', expectedVersion: 1, action: 'withdraw-review', reason: '' });
    request.mockImplementation(async () => fresh.promise);
    const next = client.statuses(); expect(next).not.toBe(first);
    old.resolve({ statusCode: 200, data: { publications: [] } }); await first;
    expect(client.statuses()).toBe(next);
    fresh.resolve({ statusCode: 200, data: { publications: [] } }); await next;
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each(['account', 'works', 'publications'] as const)('入口HTML429在%s显示限流原因，不伪装成断网或失效作品', async kind => {
    const platform: AccountPlatform = { login: async () => 'code', request: async path => path.endsWith('/login')
      ? { statusCode: 200, data: { token, account: profile } } : { statusCode: 429, data: '<html>Too Many Requests</html>' } };
    const account = new MiniAccountClient(platform, storage); await account.login();
    const read = kind === 'account' ? account.refresh() : kind === 'works' ? new MiniCloudTransport(account, platform).changes(0) : new MiniPublicationClient(account, platform).statuses();
    await expect(read).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: '请求较频繁，请稍后重试。' });
    expect(account.snapshot().status).toBe('authenticated');
  });
});
