// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { buildAiRequest } from '../features/ai/protocol';
import { newSession } from '../lib/domain/article-ai';
import { emptyDraft } from '../lib/domain/writing';
import { prepareArticleAiRequest } from '../server/article-ai';
import { CostGovernanceStore } from '../server/cost-governance';
import { createGateway } from '../server/gateway';
import type { OperationEntry } from '../server/operations';

const origin = 'http://localhost:3001';
const configuration = { apiKey: 'test-only-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' as const };
const credentials = { appId: '123456', secretId: 'test-id', secretKey: 'test-key' };
const resources: Array<{ app: Awaited<ReturnType<typeof createGateway>>; cost: CostGovernanceStore; sockets?: WebSocket[] }> = [];
const payload = () => buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: '周末我去了公园。' }), 'regular', '', crypto.randomUUID());
const response = () => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: '整理了标点。', body: '周末，我去了公园。', citedVersionIds: [] }) } }],
  usage: { prompt_tokens: 100, completion_tokens: 40 },
});

class Upstream extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
}

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    for (const socket of resource.sockets ?? []) socket.terminate();
    await resource.app.close();
    resource.cost.close();
  }
});

describe('paid gateway cost guards', () => {
  it('rejects an article before DeepSeek when the daily budget cannot cover its bound', async () => {
    const request = payload();
    const prepared = prepareArticleAiRequest(request);
    const cost = new CostGovernanceStore(':memory:', {
      articleAiDailyTokens: prepared.maxInputTokens + prepared.maxOutputTokens - 1,
      topicAiDailyTokens: 1_100_000,
      speechDailySeconds: 300,
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
    const operations: OperationEntry[] = [];
    const app = await createGateway({ origin, ai: { configuration, fetch }, costGovernance: cost, operations: entry => operations.push(entry) });
    resources.push({ app, cost });
    const result = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
    expect(result.statusCode).toBe(429);
    expect(result.json().error).toContain('今日 AI 额度');
    expect(fetch).not.toHaveBeenCalled();
    expect(operations.at(-1)).toMatchObject({ action: 'ai.regular', status: 429, errorCategory: 'daily_budget_exhausted' });
  });

  it('settles returned tokens and conservatively charges an unknown failed article call', async () => {
    const request = payload();
    const prepared = prepareArticleAiRequest(request);
    const cost = new CostGovernanceStore(':memory:', {
      articleAiDailyTokens: (prepared.maxInputTokens + prepared.maxOutputTokens) * 2,
      topicAiDailyTokens: 1_100_000,
      speechDailySeconds: 300,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response('', { status: 500 }));
    const app = await createGateway({ origin, ai: { configuration, fetch }, costGovernance: cost });
    resources.push({ app, cost });
    expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request })).statusCode).toBe(200);
    expect(cost.snapshot().articleAi).toMatchObject({ inputTokens: 100, outputTokens: 40, reservedTokens: 0 });
    expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request })).statusCode).toBe(502);
    expect(cost.snapshot().articleAi).toMatchObject({
      inputTokens: 100 + prepared.maxInputTokens,
      outputTokens: 40 + prepared.maxOutputTokens,
      reservedTokens: 0,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects exhausted speech before Tencent and settles a cancelled allowed session in seconds', async () => {
    const exhausted = new CostGovernanceStore(':memory:', { articleAiDailyTokens: 1, topicAiDailyTokens: 1, speechDailySeconds: 0 });
    const exhaustedConnect = vi.fn<() => WebSocket>();
    const first = await createGateway({ origin, credentials, connect: exhaustedConnect, costGovernance: exhausted });
    resources.push({ app: first, cost: exhausted });
    expect((await first.inject('/api/speech/status')).json()).toEqual({ configured: false, provider: '腾讯云', maxSeconds: 0 });
    await expect(first.injectWS('/api/speech', { headers: { origin } })).rejects.toThrow();
    expect(exhaustedConnect).not.toHaveBeenCalled();

    const cost = new CostGovernanceStore(':memory:', { articleAiDailyTokens: 1, topicAiDailyTokens: 1, speechDailySeconds: 1 });
    const upstream = new Upstream();
    const connect = vi.fn<() => WebSocket>(() => upstream as unknown as WebSocket);
    const app = await createGateway({ origin, credentials, connect, costGovernance: cost });
    await app.ready();
    const sockets: WebSocket[] = [];
    resources.push({ app, cost, sockets });
    const socket = await app.injectWS('/api/speech', { headers: { origin } });
    sockets.push(socket);
    expect(connect).toHaveBeenCalledOnce();
    socket.send('{"type":"cancel"}');
    await vi.waitFor(() => expect(upstream.readyState).toBe(3));
    expect(cost.snapshot().speech).toMatchObject({ usedSeconds: 1, reservedSeconds: 0, remainingSeconds: 0 });
  });
});
