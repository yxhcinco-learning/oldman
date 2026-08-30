// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createGateway } from '../server/gateway';
import { loadAiConfiguration, type AiGatewayOptions } from '../server/article-ai';
import { emptyDraft } from '../lib/domain/writing';
import { newSession } from '../lib/domain/article-ai';
import { buildAiRequest } from '../features/ai/protocol';

const configuration = { apiKey: 'test-only-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' as const };
const origin = 'http://localhost:3001';
const gateways: Awaited<ReturnType<typeof createGateway>>[] = [];
afterEach(async () => { for (const app of gateways.splice(0)) await app.close(); });
const payload = () => buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: '周末我去了公园。' }), 'regular', '', crypto.randomUUID());
const response = (content: unknown = { answer: '整理了标点。', body: '周末，我去了公园。', citedVersionIds: [] }, finish = 'stop') => Response.json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });
async function gateway(options: Partial<AiGatewayOptions> = {}) {
  const app = await createGateway({ origin, ai: { configuration, fetch: vi.fn(async () => response()), ...options } }); gateways.push(app); return app;
}
it('uses only the official configured service and never includes secrets in client status or results', async () => {
  const call = vi.fn(async () => response()); const app = await gateway({ fetch: call });
  const status = await app.inject({ method: 'GET', url: '/api/ai/status' }); expect(status.json().configured).toBe(true); expect(status.body).not.toContain(configuration.apiKey);
  const request = payload(); const result = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
  expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ requestId: request.requestId, usage: { input: 100, output: 40 } });
  const init = (call.mock.calls as unknown as [string, RequestInit][])[0][1]; const body = JSON.parse(init.body as string);
  expect(body).toMatchObject({ model: 'deepseek-v4-flash', stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' } });
  expect(body.messages[0].content).toContain('不新增事实'); expect(body.messages[0].content).toContain('title 仅作参考');
  expect(JSON.parse(body.messages[1].content).current).toEqual(request.current);
  expect(result.body).not.toContain(configuration.apiKey);
  expect(loadAiConfiguration({ DEEPSEEK_API_KEY: 'test-only-key', DEEPSEEK_BASE_URL: 'https://attacker.example' })).toBeUndefined();
});
it('rejects missing or foreign origins, empty input and model overrides before calling upstream', async () => {
  const call = vi.fn(async () => response()); const app = await gateway({ fetch: call });
  for (const headers of [{}, { origin: 'https://foreign.example' }]) expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers, payload: payload() })).statusCode).toBe(403);
  for (const body of [{ ...payload(), model: 'other' }, { ...payload(), current: { ...payload().current, body: ' ' } },
    { ...payload(), action: 'rewrite', prompt: ' ' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: body })).statusCode).toBe(400);
  }
  expect(call).not.toHaveBeenCalled();
});
it('leaves speech status available when AI is not configured', async () => {
  const app = await gateway({ configuration: undefined });
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() })).statusCode).toBe(503);
  expect((await app.inject('/api/speech/status')).statusCode).toBe(200);
});
it('does not repeat a claimed edit when the candidate equals the current article', async () => {
  const request = { ...payload(), action: 'rewrite' as const, prompt: '让第一句更自然' };
  const app = await gateway({ fetch: vi.fn(async () => response({ answer: '已经修改了错别字。', body: request.current.body, citedVersionIds: [] })) });
  const result = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
  expect(result.statusCode).toBe(200);
  expect(result.json().result).toMatchObject({ body: request.current.body, answer: '本次保留原文，未产生正文修改。' });
});
it('uses an explicit conversational instruction to return a full candidate while keeping questions read only', async () => {
  const call = vi.fn(async () => response({ answer: '删除了第二段。', body: '周末我去了公园。', citedVersionIds: [] }));
  const app = await gateway({ fetch: call });
  const request = buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: '周末我去了公园。\n\n第二段。' }),
    'rewrite', '删除第二段，其余保持不变', crypto.randomUUID());
  const result = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
  expect(result.statusCode).toBe(200); expect(result.json().result.body).toBe('周末我去了公园。');
  const body = JSON.parse((call.mock.calls as unknown as [string, RequestInit][])[0][1].body as string);
  expect(body.messages[0].content).toContain('prompt 是用户明确选择“调整文章”');
  expect(body.messages[0].content).toContain('不得改 title');
  expect(body.messages[0].content).toContain('不得改成“我们一起种下”');
  expect(body.messages[0].content).toContain('可以加入不改变核心事实的合理文学性氛围表达');
  expect(body.messages[0].content).toContain('answer 必须明确说明加入了哪类氛围');
  expect(JSON.parse(body.messages[1].content)).toMatchObject({ action: 'rewrite', prompt: '删除第二段，其余保持不变' });
});
it.each([401, 402, 429, 500])('sanitizes upstream HTTP %s errors without retrying', async code => {
  const call = vi.fn(async () => new Response('secret-and-private-body', { status: code })); const app = await gateway({ fetch: call });
  const result = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() });
  expect(result.statusCode).toBe(code === 429 ? 429 : 502); expect(result.body).not.toContain('secret-and-private-body'); expect(call).toHaveBeenCalledOnce();
});
it.each(['length', 'content_filter', 'insufficient_system_resource'])('rejects incomplete %s output', async finish => {
  const app = await gateway({ fetch: vi.fn(async () => response(undefined, finish)) });
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() })).statusCode).toBe(502);
});
it('rejects invented citations, malformed JSON and oversized responses', async () => {
  const call = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ answer: '引用', body: '正文', citedVersionIds: ['not-provided'] }))
    .mockResolvedValueOnce(new Response('not json'))
    .mockResolvedValueOnce(new Response('x'.repeat(256 * 1024 + 1)));
  const app = await gateway({ fetch: call });
  for (let i = 0; i < 3; i++) expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() })).statusCode).toBe(502);
});
it('limits concurrency and releases the slot after timeout', async () => {
  const call = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
  const app = await gateway({ fetch: call, timeoutMs: 100, maxConcurrent: 1 });
  const first = app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() }).then(result => result);
  await vi.waitFor(() => expect(call).toHaveBeenCalledOnce());
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() })).statusCode).toBe(429);
  expect((await first).statusCode).toBe(504);
  call.mockResolvedValueOnce(response());
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: payload() })).statusCode).toBe(200);
});
it('limits request frequency and strips body from textual follow-up', async () => {
  const app = await gateway({ requestsPerMinute: 1 }); const request = { ...payload(), action: 'question' as const, prompt: '请直接改写' };
  const result = await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request });
  expect(result.statusCode).toBe(200); expect(result.json().result.body).toBeUndefined();
  expect((await app.inject({ method: 'POST', url: '/api/ai/turn', headers: { origin }, payload: request })).statusCode).toBe(429);
});
it('aborts the upstream when a real HTTP client disconnects', async () => {
  let signal: AbortSignal | undefined;
  const call = vi.fn<typeof fetch>((_url, init) => { signal = init!.signal!; return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')))); });
  const app = await gateway({ fetch: call }); const url = await app.listen({ host: '127.0.0.1', port: 0 });
  const controller = new AbortController();
  const pending = fetch(url + '/api/ai/turn', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), signal: controller.signal }).catch(() => null);
  await vi.waitFor(() => expect(call).toHaveBeenCalledOnce()); controller.abort(); await pending;
  await vi.waitFor(() => expect(signal?.aborted).toBe(true));
});
