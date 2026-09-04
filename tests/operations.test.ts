// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createGateway } from '../server/gateway';
import { emptyDraft } from '../lib/domain/writing';
import { newSession } from '../lib/domain/article-ai';
import { buildAiRequest } from '../features/ai/protocol';
import { OperationMonitor, type OperationEntry } from '../server/operations';

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
    topicAiConfigured: false, topicAdminConfigured: false, miniIdentityConfigured: false, costGovernanceConfigured: false });
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

it('keeps bounded lifetime and rolling aggregate metrics without request identifiers', () => {
  let now = Date.parse('2026-09-04T08:00:00.000Z');
  const monitor = new OperationMonitor(() => now);
  monitor.record({ requestId: 'private-request-one', action: 'ai.regular', status: 200, durationMs: 42, tokens: { input: 20, output: 5 } });
  monitor.record({ requestId: 'private-request-two', action: 'ai.regular', status: 502, durationMs: 900, errorCategory: 'upstream_network' });
  now += 16 * 60_000;
  monitor.record({ requestId: 'private-request-three', action: 'topics.list', status: 404, durationMs: 12, errorCategory: 'not_found' });
  const snapshot = monitor.snapshot();

  expect(snapshot.lifetime).toMatchObject({ requests: 3, successes: 1, clientErrors: 1, serverErrors: 1, inputTokens: 20, outputTokens: 5 });
  expect(snapshot.last15Minutes).toMatchObject({ requests: 1, clientErrors: 1 });
  expect(snapshot.last60Minutes.requests).toBe(3);
  expect(snapshot.actions.find(action => action.action === 'ai.regular')).toMatchObject({ requests: 2, p95DurationMs: 1_000,
    errors: { upstream_network: 1 } });
  expect(JSON.stringify(snapshot)).not.toContain('private-request');

  now += 61 * 60_000;
  expect(monitor.snapshot().last60Minutes.requests).toBe(0);
  expect(monitor.snapshot().lifetime.requests).toBe(3);
});

it('accepts only strict anonymous product events and applies the global rate limit', async () => {
  const entries: OperationEntry[] = [];
  const app = await createGateway({ origin, operations: entry => entries.push(entry), eventRequestsPerMinute: 2 });
  gateways.push(app);
  const request = (payload: Record<string, unknown>, requestOrigin = origin, contentType = 'application/json') => app.inject({ method: 'POST', url: '/api/operations/events',
    headers: { origin: requestOrigin, 'content-type': contentType }, payload });

  expect((await request({ event: 'app.opened' })).statusCode).toBe(204);
  expect((await request({ event: 'topic.opened', topicId: 'must-not-be-accepted' })).statusCode).toBe(400);
  expect((await request({ event: 'writing.started.blank' })).statusCode).toBe(429);
  expect((await request({ event: 'app.opened' }, 'https://foreign.example')).statusCode).toBe(403);
  expect((await request({ event: 'app.opened' }, origin, 'text/plain')).statusCode).toBe(415);
  expect((await app.inject({ method: 'POST', url: '/api/operations/events', headers: { origin, 'content-type': 'application/json' },
    payload: JSON.stringify({ event: 'app.opened', padding: 'x'.repeat(300) }) })).statusCode).toBe(413);
  expect(entries.map(entry => [entry.action, entry.status, entry.errorCategory])).toEqual([
    ['event.app.opened', 204, undefined],
    ['event.report', 400, 'invalid_event'],
    ['event.report', 429, 'rate_limited'],
    ['event.report', 403, 'origin_rejected'],
    ['event.report', 415, 'content_type'],
  ]);
  expect(JSON.stringify(entries)).not.toContain('must-not-be-accepted');
});
