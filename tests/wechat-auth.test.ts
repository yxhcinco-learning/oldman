// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import type { OperationEntry } from '../server/operations';
import {
  WechatAuthService,
  WechatCode2SessionTransport,
  WechatExchangeError,
  type WechatCodeTransport,
  type WechatExchangeErrorCategory,
} from '../server/wechat-auth';

const resources: Array<{ store: MiniIdentityStore; directory: string }> = [];
const apps: Array<Awaited<ReturnType<typeof createGateway>>> = [];

async function store() {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-wechat-auth-'));
  let tokenNumber = 0;
  const identityStore = new MiniIdentityStore({ path: join(directory, 'auth.sqlite'), randomToken: () => `gateway_session_${++tokenNumber}`.padEnd(43, 'x') });
  resources.push({ store: identityStore, directory });
  return identityStore;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const resource of resources.splice(0)) {
    resource.store.close();
    await rm(resource.directory, { recursive: true, force: true });
  }
});

describe('微信 code2Session 受限传输', () => {
  it('只请求固定微信端点，校验响应并立即丢弃 session_key', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ openid: 'openid-private', session_key: 'session-key-private' }), { status: 200 }));
    const transport = new WechatCode2SessionTransport({ appId: 'wx1234567890', appSecret: 'server-only-value' }, fetcher);
    await expect(transport.exchange('single-use-code')).resolves.toEqual({ appId: 'wx1234567890', openid: 'openid-private' });
    const requested = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requested.origin + requested.pathname).toBe('https://api.weixin.qq.com/sns/jscode2session');
    expect(requested.searchParams.get('grant_type')).toBe('authorization_code');
    expect(JSON.stringify(await transport.exchange('another-code'))).not.toContain('session-key-private');
  });

  it('不重试并把无效 code、上游失败和异常响应收敛为无敏感详情错误', async () => {
    const cases: Array<{ response: Response | Error; category: WechatExchangeErrorCategory }> = [
      { response: new Response(JSON.stringify({ errcode: 40029, errmsg: 'invalid code from provider' })), category: 'invalid_code' },
      { response: new Response('provider secret text', { status: 502 }), category: 'upstream_unavailable' },
      { response: new Response(JSON.stringify({ openid: 'only-openid' })), category: 'invalid_response' },
      { response: new Response('x'.repeat(16 * 1024 + 1)), category: 'invalid_response' },
      { response: new Error('network details'), category: 'upstream_unavailable' },
    ];
    for (const item of cases) {
      const fetcher = vi.fn<typeof fetch>(async () => { if (item.response instanceof Error) throw item.response; return item.response; });
      const transport = new WechatCode2SessionTransport({ appId: 'wx1234567890', appSecret: 'server-only-value' }, fetcher);
      await expect(transport.exchange('single-use-code')).rejects.toEqual(expect.objectContaining<Partial<WechatExchangeError>>({ category: item.category }));
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});

describe('无感微信身份服务与端点', () => {
  it('在上游调用前消费一次性 code，并拒绝重放和 AppID 错配且不创建用户', async () => {
    const identityStore = await store();
    const exchange = vi.fn<WechatCodeTransport['exchange']>(async () => ({ appId: 'wx-test-domain', openid: 'openid-one' }));
    const service = new WechatAuthService({ appId: 'wx-test-domain' }, identityStore, { exchange });
    const first = await service.login('one-use-code');
    expect(service.authenticateBearer(`Bearer ${first.token}`).userId).toBe(first.userId);
    await expect(service.login('one-use-code')).rejects.toEqual(expect.objectContaining({ category: 'replayed_code' }));
    expect(exchange).toHaveBeenCalledTimes(1);

    const mismatch = new WechatAuthService({ appId: 'wx-another-domain' }, identityStore, { exchange });
    await expect(mismatch.login('different-code')).rejects.toEqual(expect.objectContaining({ category: 'app_mismatch' }));
    expect(identityStore.statistics()).toMatchObject({ users: 1, identities: 1, sessions: 1, usedCodes: 2 });
  });

  it('并发提交同一个 code 时只有一个请求能到达微信传输层', async () => {
    const identityStore = await store();
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const exchange = vi.fn<WechatCodeTransport['exchange']>(async () => {
      await gate;
      return { appId: 'wx-test-domain', openid: 'openid-one' };
    });
    const service = new WechatAuthService({ appId: 'wx-test-domain' }, identityStore, { exchange });
    const first = service.login('concurrent-code');
    const second = service.login('concurrent-code');
    await expect(second).rejects.toEqual(expect.objectContaining({ category: 'replayed_code' }));
    release();
    await expect(first).resolves.toEqual(expect.objectContaining({ token: expect.any(String) }));
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('签发最小响应，按 IP 预限流，并保证响应和操作日志不含身份秘密', async () => {
    const identityStore = await store();
    const exchange = vi.fn<WechatCodeTransport['exchange']>(async () => ({ appId: 'wx-test-domain', openid: 'openid-private' }));
    const service = new WechatAuthService({ appId: 'wx-test-domain' }, identityStore, { exchange });
    const operations: OperationEntry[] = [];
    const app = await createGateway({ origin: 'https://web.example', miniAuth: { service, requestsPerMinute: 2 }, operations: entry => operations.push(entry) });
    apps.push(app);

    const success = await app.inject({ method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'first-code' } });
    expect(success.statusCode).toBe(200);
    expect(success.json()).toEqual({ token: expect.any(String), expiresAt: expect.any(String) });
    expect(Object.keys(success.json()).sort()).toEqual(['expiresAt', 'token']);
    expect(success.headers['cache-control']).toBe('no-store');

    const profilePayload = await createGateway({ origin: 'https://web.example', miniAuth: { service } });
    apps.push(profilePayload);
    const rejectedProfile = await profilePayload.inject({
      method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'profile-code', nickname: '不需要的资料' },
    });
    expect(rejectedProfile.statusCode).toBe(400);
    expect(exchange).toHaveBeenCalledTimes(1);

    const replay = await app.inject({ method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'first-code' } });
    expect(replay.statusCode).toBe(401);
    const limited = await app.inject({ method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'third-code' } });
    expect(limited.statusCode).toBe(429);
    expect(exchange).toHaveBeenCalledTimes(1);

    const visible = JSON.stringify({ success: success.json(), replay: replay.json(), limited: limited.json(), operations });
    expect(visible).not.toContain('openid-private');
    expect(visible).not.toContain('first-code');
    expect(visible).not.toContain('Authorization');
    expect(operations.map(entry => entry.errorCategory)).toEqual([undefined, 'code_rejected', 'rate_limited']);
  });

  it('未配置或上游失败时保持端点可控且不创建假用户', async () => {
    const unconfigured = await createGateway({ origin: 'https://web.example' });
    apps.push(unconfigured);
    expect((await unconfigured.inject({ method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'unused-code' } })).statusCode).toBe(503);

    const identityStore = await store();
    const service = new WechatAuthService({ appId: 'wx-test-domain' }, identityStore, {
      exchange: async () => { throw new WechatExchangeError('upstream_unavailable'); },
    });
    const app = await createGateway({ origin: 'https://web.example', miniAuth: { service } });
    apps.push(app);
    const failed = await app.inject({ method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'failed-code' } });
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({ error: '微信登录暂不可用，本地写作仍可使用' });
    expect(identityStore.statistics()).toMatchObject({ users: 0, identities: 0, sessions: 0, usedCodes: 1 });
  });
});
