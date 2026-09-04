// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createGateway } from '../server/gateway';
import { emptyDraft } from '../lib/domain/writing';
import { newSession } from '../lib/domain/article-ai';
import { buildAiRequest } from '../features/ai/protocol';
import type { OperationEntry } from '../server/operations';

const origin = 'https://suiyue.maicong.chat';
const secret = 'test-only-secret-never-log';
const privateText = '这段正文不能进入操作日志。';
const gateways: Awaited<ReturnType<typeof createGateway>>[] = [];

afterEach(async () => {
  for (const app of gateways.splice(0)) await app.close();
});

it('reports health without secrets and emits only bounded operational fields', async () => {
  const entries: OperationEntry[] = [];
  const app = await createGateway({
    origin,
    credentials: { appId: '123456', secretId: secret, secretKey: secret },
    ai: { configuration: { apiKey: secret, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' } },
    operations: entry => entries.push(entry),
  });
  gateways.push(app);

  const response = await app.inject('/api/health');
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual({ status: 'ok', aiConfigured: true, speechConfigured: true, topicsConfigured: false,
    topicAdminConfigured: false, miniIdentityConfigured: false });
  expect(response.body).not.toContain(secret);
  expect(entries).toHaveLength(1);
  expect(Object.keys(entries[0]).sort()).toEqual(['action', 'durationMs', 'requestId', 'status']);
  expect(entries[0]).toMatchObject({ action: 'health', status: 200 });
});

it('logs AI action, status and token counts without request or provider content', async () => {
  const entries: OperationEntry[] = [];
  const upstream = vi.fn(async () => Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: '只改了标点。', body: `${privateText}。`, citedVersionIds: [] }) } }],
    usage: { prompt_tokens: 21, completion_tokens: 8 },
  }));
  const app = await createGateway({
    origin,
    ai: { configuration: { apiKey: secret, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }, fetch: upstream },
    operations: entry => entries.push(entry),
  });
  gateways.push(app);
  const request = buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: privateText }), 'regular', '', crypto.randomUUID());
  const response = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
  expect(response.statusCode).toBe(200);
  expect(entries.at(-1)).toMatchObject({ action: 'ai.regular', status: 200, tokens: { input: 21, output: 8 } });
  const serialized = JSON.stringify(entries);
  expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain(privateText);
  expect(serialized).not.toContain(request.requestId);
  expect(Object.keys(entries.at(-1)!).sort()).toEqual(['action', 'durationMs', 'requestId', 'status', 'tokens']);
});

it('uses fixed error categories for rejected origins and sanitized upstream failures', async () => {
  const entries: OperationEntry[] = [];
  const upstream = vi.fn(async () => new Response('private upstream response', { status: 401 }));
  const app = await createGateway({
    origin,
    ai: { configuration: { apiKey: secret, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }, fetch: upstream },
    operations: entry => entries.push(entry),
  });
  gateways.push(app);
  const request = buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: privateText }), 'regular', '', crypto.randomUUID());
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin: 'https://foreign.example' }, payload: request })).statusCode).toBe(403);
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request })).statusCode).toBe(502);
  expect(entries.map(entry => entry.errorCategory)).toEqual(['origin_rejected', 'upstream_auth']);
  expect(JSON.stringify(entries)).not.toContain('private upstream response');
  expect(JSON.stringify(entries)).not.toContain(privateText);
});
