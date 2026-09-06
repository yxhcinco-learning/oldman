// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import type { OperationEntry } from '../server/operations';
import { WechatAuthService } from '../server/wechat-auth';
import { emptyDraft } from '../packages/core/src/writing';
import { newSession } from '../packages/core/src/article-ai';
import { buildAiRequest } from '../packages/core/src/ai-protocol';

const origin = 'http://localhost:3001';
const configuration = { apiKey: 'test-only-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' as const };
const resources: Array<{ app: Awaited<ReturnType<typeof createGateway>>; store?: MiniIdentityStore }> = [];
const payload = () => buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: '周末我去了公园。' }), 'regular', '', crypto.randomUUID());
const upstreamResponse = () => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: '整理了标点。', body: '周末，我去了公园。', citedVersionIds: [] }) } }],
  usage: { prompt_tokens: 20, completion_tokens: 10 },
});

function identity(now: () => number = Date.now, sessionTtlMs?: number) {
  let tokenNumber = 0;
  const store = new MiniIdentityStore({ path: ':memory:', now, sessionTtlMs, randomToken: () => `mini_ai_session_${++tokenNumber}`.padEnd(43, 'x') });
  const service = new WechatAuthService({ appId: 'wx-test-domain' }, store, {
    exchange: async () => ({ appId: 'wx-test-domain', openid: 'openid-private' }),
  });
  return { store, service };
}

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.app.close();
    resource.store?.close();
  }
});

describe('小程序鉴权 AI 网关', () => {
  it('在 DeepSeek 之前统一拒绝缺失、畸形、撤销和过期会话', async () => {
    let now = 1000;
    const { store, service } = identity(() => now, 100);
    const call = vi.fn<typeof fetch>(async () => upstreamResponse());
    const app = await createGateway({ origin, miniAuth: { service }, ai: { configuration, fetch: call } });
    resources.push({ app, store });
    const request = payload();
    for (const authorization of [undefined, 'Bearer short', `Basic ${'x'.repeat(43)}`]) {
      const result = await app.inject({ method: 'POST', url: '/api/mini/ai/turn', headers: authorization ? { authorization } : {}, payload: request });
      expect(result.statusCode).toBe(401);
      expect(result.json()).toEqual({ code: 'invalid_session', error: '登录已过期，请主动登录后继续。' });
    }
    const revoked = store.issueSession('wx-test-domain', 'openid-one');
    store.revoke(revoked.token);
    expect((await app.inject({ method: 'POST', url: '/api/mini/ai/turn', headers: { authorization: `Bearer ${revoked.token}` }, payload: request })).statusCode).toBe(401);
    const expired = store.issueSession('wx-test-domain', 'openid-two');
    now = expired.expiresAt;
    expect((await app.inject({ method: 'POST', url: '/api/mini/ai/turn', headers: { authorization: `Bearer ${expired.token}` }, payload: request })).statusCode).toBe(401);
    expect(call).not.toHaveBeenCalled();
  });

  it('有效业务会话不依赖浏览器 Origin，并与网页路由使用同一请求响应 schema', async () => {
    const { store, service } = identity();
    const call = vi.fn<typeof fetch>(async () => upstreamResponse());
    const operations: OperationEntry[] = [];
    const app = await createGateway({ origin, miniAuth: { service }, ai: { configuration, fetch: call }, operations: entry => operations.push(entry) });
    resources.push({ app, store });
    const session = store.issueSession('wx-test-domain', 'openid-private');
    const request = payload();
    const mini = await app.inject({
      method: 'POST', url: '/api/mini/ai/turn',
      headers: { authorization: `Bearer ${session.token}`, origin: 'https://foreign.example' }, payload: request,
    });
    const web = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
    expect(mini.statusCode).toBe(200);
    expect(web.statusCode).toBe(200);
    expect(mini.json()).toEqual(web.json());
    expect(call).toHaveBeenCalledTimes(2);
    const visible = JSON.stringify({ operations, mini: mini.json() });
    expect(visible).not.toContain(session.token);
    expect(visible).not.toContain('openid-private');
    expect(operations.map(entry => entry.action)).toEqual(['mini.ai.regular', 'ai.regular']);
  });

  it('对每个内部用户限制并发与频率，同时让未配置的话题库独立失败关闭', async () => {
    const { store, service } = identity();
    let release: (value: Response) => void = () => {};
    const firstResponse = new Promise<Response>(resolve => { release = resolve; });
    const call = vi.fn<typeof fetch>().mockReturnValueOnce(firstResponse).mockResolvedValue(upstreamResponse());
    const app = await createGateway({
      origin, miniAuth: { service },
      ai: { configuration, fetch: call, maxConcurrent: 2, miniMaxConcurrentPerUser: 1, miniRequestsPerMinute: 2 },
    });
    resources.push({ app, store });
    const session = store.issueSession('wx-test-domain', 'openid-one');
    const headers = { authorization: `Bearer ${session.token}` };
    const first = app.inject({ method: 'POST', url: '/api/mini/ai/turn', headers, payload: payload() });
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect((await app.inject({ method: 'POST', url: '/api/mini/ai/turn', headers, payload: payload() })).statusCode).toBe(429);
    release(upstreamResponse());
    expect((await first).statusCode).toBe(200);
    expect((await app.inject('/api/topics?limit=1')).statusCode).toBe(503);
  });

  it('身份服务未配置时也不会触发付费上游', async () => {
    const call = vi.fn<typeof fetch>(async () => upstreamResponse());
    const app = await createGateway({ origin, ai: { configuration, fetch: call } });
    resources.push({ app });
    const result = await app.inject({ method: 'POST', url: '/api/mini/ai/turn', headers: { authorization: `Bearer ${'x'.repeat(43)}` }, payload: payload() });
    expect(result.statusCode).toBe(503);
    expect(call).not.toHaveBeenCalled();
  });
});
