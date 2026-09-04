// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TopicGenerationRequest } from '../lib/domain/topics';
import { createGateway } from '../server/gateway';
import { createTopicAdminPasswordHash, TopicAdminAuthService } from '../server/topic-admin-auth';
import { callDeepSeekTopicCandidate, TopicAiError } from '../server/topic-ai';
import { TopicStore } from '../server/topic-store';

const configuration = { apiKey: 'test-topic-ai-secret', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' as const };
const ORIGIN = 'https://editor.example';
const now = new Date('2026-09-04T08:00:00.000Z');
const resources: Array<{ app: Awaited<ReturnType<typeof createGateway>>; store: TopicStore }> = [];

const output = (overrides: Record<string, unknown> = {}) => ({
  kind: 'current', title: '社区食堂多了，晚年生活也有了新的饭桌',
  summary: '越来越多社区尝试提供面向老年人的助餐服务，一顿饭也连接着生活便利、邻里交往和个人选择。',
  editorJudgment: '亲历者可以从一顿具体的饭写起，表达对便利、口味、尊严和邻里关系的真实判断。',
  angles: [{ id: 'angle-1', title: '一顿饭的变化', prompt: '社区食堂出现前后，自己吃饭这件事发生过什么变化' }],
  starterQuestion: '您第一次走进社区食堂时，最先注意到的是什么？', tags: ['社区生活', '助餐'],
  suggestedExpiresAt: '2026-10-31T23:59:59.000Z', sources: [], ...overrides,
});

function response(candidate: Record<string, unknown> = output(), searchCalls = 0) {
  return Response.json({ status: 'completed', output: [
    ...Array.from({ length: searchCalls }, (_, index) => ({ type: 'web_search_call', id: `search-${index}` })),
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(candidate) }] },
  ], usage: { input_tokens: 321, output_tokens: 123, total_tokens: 444 } });
}

const request = (overrides: Partial<TopicGenerationRequest> = {}): TopicGenerationRequest => ({
  brief: '从社区食堂里的一顿饭谈退休生活', urls: [], webSearchEnabled: true, ...overrides,
});

afterEach(async () => {
  for (const resource of resources.splice(0)) { await resource.app.close(); resource.store.close(); }
});

describe('DeepSeek Responses topic adapter', () => {
  it('sends one structured Responses request and enables optional search for text', async () => {
    const transport = vi.fn<typeof fetch>(async () => response(output(), 2));
    const result = await callDeepSeekTopicCandidate(request(), configuration, { fetch: transport, generatedAt: now.toISOString() });
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toBe('https://api.deepseek.com/responses');
    const init = transport.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'deepseek-v4-flash', tools: [{ type: 'web_search' }], tool_choice: 'auto',
      text: { format: { type: 'json_schema', name: 'topic_candidate' } } });
    expect(body).not.toHaveProperty('messages');
    expect(result).toMatchObject({ content: { title: output().title, sources: [] }, usage: { input: 321, output: 123 }, searchCalls: 2 });
  });

  it('forces search for link input and removes the tool entirely when search is disabled', async () => {
    const linked = vi.fn<typeof fetch>(async () => response());
    await callDeepSeekTopicCandidate(request({ brief: '', urls: ['https://example.com/story'] }), configuration, { fetch: linked });
    expect(JSON.parse(String((linked.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      tools: [{ type: 'web_search' }], tool_choice: { type: 'web_search' },
    });
    const offline = vi.fn<typeof fetch>(async () => response());
    await callDeepSeekTopicCandidate(request({ webSearchEnabled: false }), configuration, { fetch: offline });
    const offlineBody = JSON.parse(String((offline.mock.calls[0][1] as RequestInit).body));
    expect(offlineBody.tool_choice).toBe('none');
    expect(offlineBody).not.toHaveProperty('tools');
  });

  it('rejects malformed output, timeout and cancellation without retrying', async () => {
    const malformed = vi.fn<typeof fetch>(async () => response({ title: '字段不完整' }));
    await expect(callDeepSeekTopicCandidate(request(), configuration, { fetch: malformed })).rejects
      .toMatchObject({ category: 'upstream_invalid_response' } satisfies Partial<TopicAiError>);
    expect(malformed).toHaveBeenCalledOnce();

    const waitForAbort = vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    await expect(callDeepSeekTopicCandidate(request(), configuration, { fetch: waitForAbort, timeoutMs: 5 })).rejects
      .toMatchObject({ category: 'timeout' } satisfies Partial<TopicAiError>);
    expect(waitForAbort).toHaveBeenCalledOnce();

    const controller = new AbortController();
    const cancelled = callDeepSeekTopicCandidate(request(), configuration, { fetch: waitForAbort, signal: controller.signal, timeoutMs: 5000 });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ category: 'cancelled' } satisfies Partial<TopicAiError>);
  });
});

async function adminGateway(transport?: typeof fetch) {
  const store = new TopicStore({ path: ':memory:', now: () => now });
  const auth = new TopicAdminAuthService(store, { username: 'editor', passwordHash: createTopicAdminPasswordHash('candidate generation password'),
    secureCookie: false, sessionDurationMs: 60 * 60_000 }, () => now);
  const app = await createGateway({ origin: ORIGIN, topics: store, topicAdmin: { auth, now: () => now.getTime() },
    topicAi: { configuration, fetch: transport, timeoutMs: 5000 } });
  resources.push({ app, store });
  await app.ready();
  const login = await app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: { username: 'editor', password: 'candidate generation password' } });
  return { app, store, headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-csrf-token': login.json().csrfToken as string,
    cookie: login.cookies.map(item => `${item.name}=${item.value}`).join('; ') } };
}

describe('authenticated topic generation endpoint', () => {
  it('stores one candidate plus model, usage and web-search accounting', async () => {
    const transport = vi.fn<typeof fetch>(async () => response(output(), 1));
    const { app, store, headers } = await adminGateway(transport);
    const result = await app.inject({ method: 'POST', url: '/api/admin/topic-generations', headers, payload: request({
      urls: ['https://example.com/community-meals'],
    }) });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({ generation: { status: 'succeeded', model: 'deepseek-v4-flash', inputTokens: 321,
      outputTokens: 123, searchCalls: 1 }, topic: { topic: { status: 'candidate', sources: [] } } });
    expect(store.statistics()).toMatchObject({ topics: 1, revisions: 1, generations: 1 });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('enforces one concurrent top-level request and records a fixed failure without retry', async () => {
    let release!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const transport = vi.fn<typeof fetch>().mockReturnValueOnce(pending).mockResolvedValue(response());
    const { app, store, headers } = await adminGateway(transport);
    const first = app.inject({ method: 'POST', url: '/api/admin/topic-generations', headers, payload: request() });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    const busy = await app.inject({ method: 'POST', url: '/api/admin/topic-generations', headers, payload: request() });
    expect(busy.statusCode).toBe(429);
    expect(transport).toHaveBeenCalledOnce();
    release(response());
    expect((await first).statusCode).toBe(201);
    expect(store.listGenerations().map(item => item.status)).toEqual(expect.arrayContaining(['failed', 'succeeded']));
    expect(store.listGenerations().find(item => item.errorCategory === 'busy')).toBeDefined();
  });

  it('rejects link-only offline input before any provider call and keeps manual drafts available', async () => {
    const transport = vi.fn<typeof fetch>(async () => response());
    const { app, store, headers } = await adminGateway(transport);
    const invalid = await app.inject({ method: 'POST', url: '/api/admin/topic-generations', headers,
      payload: request({ brief: '', urls: ['https://example.com/story'], webSearchEnabled: false }) });
    expect(invalid.statusCode).toBe(400);
    expect(transport).not.toHaveBeenCalled();
    const candidate = output();
    const draft = await app.inject({ method: 'POST', url: '/api/admin/topics', headers, payload: { id: 'manual-fallback', content: {
      kind: candidate.kind, title: candidate.title, summary: candidate.summary, whyItMatters: candidate.editorJudgment,
      expiresAt: candidate.suggestedExpiresAt, sources: candidate.sources, angles: candidate.angles,
      starterQuestion: candidate.starterQuestion, tags: candidate.tags,
    } } });
    expect(draft.statusCode).toBe(201);
    expect(store.statistics().topics).toBe(1);
  });
});
