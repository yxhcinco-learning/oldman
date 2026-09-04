// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway } from '../server/gateway';
import {
  createTopicAdminPasswordHash,
  loadTopicAdminConfiguration,
  TopicAdminAuthService,
  verifyTopicAdminPassword,
} from '../server/topic-admin-auth';
import { TopicStore } from '../server/topic-store';

const ORIGIN = 'https://editor.example';
const PASSWORD = 'correct horse battery staple';
const PASSWORD_HASH = createTopicAdminPasswordHash(PASSWORD);
const resources: Array<{ app: Awaited<ReturnType<typeof createGateway>>; store: TopicStore }> = [];

let now = new Date('2026-09-04T08:00:00.000Z');

const content = (title = '退休以后，怎样重新安排一天') => ({
  kind: 'slow' as const, title,
  summary: '退休后的时间不再由单位日程安排，每个人都需要重新找到舒服、稳定又有弹性的生活节奏。',
  whyItMatters: '这个话题能够从具体日常进入，让不同经历的人表达自己的选择。', expiresAt: null,
  sources: [], angles: [{ id: 'angle-1', title: '一天从什么时候开始', prompt: '一天从什么时候开始，哪些习惯保留了下来' }],
  starterQuestion: '退休后的第一个月，您最不习惯的是什么？', tags: ['退休生活'],
});

async function setup(options: { secure?: boolean; attempts?: number } = {}) {
  now = new Date('2026-09-04T08:00:00.000Z');
  const store = new TopicStore({ path: ':memory:', now: () => now });
  const auth = new TopicAdminAuthService(store, {
    username: 'editor', passwordHash: PASSWORD_HASH, secureCookie: options.secure ?? false, sessionDurationMs: 60 * 60_000,
  }, () => now);
  const app = await createGateway({ origin: ORIGIN, topics: store, topicAdmin: { auth, now: () => now.getTime(), loginAttemptsPerWindow: options.attempts } });
  resources.push({ app, store });
  await app.ready();
  return { app, store, auth };
}

afterEach(async () => {
  for (const resource of resources.splice(0)) { await resource.app.close(); resource.store.close(); }
});

async function login(app: Awaited<ReturnType<typeof createGateway>>, password = PASSWORD) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: { username: 'editor', password } });
  const cookie = response.cookies.map(item => `${item.name}=${item.value}`).join('; ');
  return { response, cookie, csrf: response.json().csrfToken as string };
}

describe('topic administrator credentials and sessions', () => {
  it('creates and verifies the documented scrypt format without storing plaintext', () => {
    const shortestPassword = 'x'.repeat(6);
    const shortestHash = createTopicAdminPasswordHash(shortestPassword);
    expect(verifyTopicAdminPassword(shortestPassword, shortestHash)).toBe(true);
    expect(() => createTopicAdminPasswordHash('x'.repeat(5))).toThrow('管理员密码长度必须为 6–1024 个字符');
    expect(() => createTopicAdminPasswordHash('x'.repeat(1024))).not.toThrow();
    expect(() => createTopicAdminPasswordHash('x'.repeat(1025))).toThrow('管理员密码长度必须为 6–1024 个字符');
    expect(verifyTopicAdminPassword('x'.repeat(5), shortestHash)).toBe(false);
    expect(PASSWORD_HASH).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(PASSWORD_HASH).not.toContain(PASSWORD);
    expect(verifyTopicAdminPassword(PASSWORD, PASSWORD_HASH)).toBe(true);
    expect(verifyTopicAdminPassword('wrong-password-value', PASSWORD_HASH)).toBe(false);
    expect(loadTopicAdminConfiguration({ TOPIC_ADMIN_USERNAME: 'editor', TOPIC_ADMIN_PASSWORD_HASH: PASSWORD_HASH, NODE_ENV: 'production' }).configuration)
      .toMatchObject({ username: 'editor', secureCookie: true });
    expect(loadTopicAdminConfiguration({ TOPIC_ADMIN_USERNAME: 'editor' }).configuration).toBeUndefined();
  });

  it('uses generic login errors, strict cookies, expiry, logout and password-rotation invalidation', async () => {
    const { app, store } = await setup({ secure: true });
    const wrong = await login(app, 'wrong-password-value');
    expect(wrong.response.statusCode).toBe(401);
    expect(wrong.response.json()).toEqual({ error: '用户名或密码不正确。' });
    const session = await login(app);
    expect(session.response.statusCode).toBe(200);
    expect(session.response.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('HttpOnly'), expect.stringContaining('SameSite=Strict'), expect.stringContaining('Secure'),
    ]));
    expect((await app.inject({ url: '/api/admin/auth/session', headers: { cookie: session.cookie } })).json()).toMatchObject({
      authenticated: true, username: 'editor', csrfToken: session.csrf,
    });

    new TopicAdminAuthService(store, { username: 'editor', passwordHash: createTopicAdminPasswordHash('a newly rotated admin password'),
      secureCookie: true, sessionDurationMs: 60 * 60_000 }, () => now);
    expect((await app.inject({ url: '/api/admin/auth/session', headers: { cookie: session.cookie } })).statusCode).toBe(401);

    const fresh = await login(app);
    expect(fresh.response.statusCode).toBe(401);
  });

  it('expires and revokes a session without exposing the token in audits', async () => {
    const { app, store } = await setup();
    const session = await login(app);
    const logout = await app.inject({ method: 'DELETE', url: '/api/admin/auth/session', headers: {
      origin: ORIGIN, cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrf,
    }, payload: {} });
    expect(logout.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/admin/auth/session', headers: { cookie: session.cookie } })).statusCode).toBe(401);
    expect(JSON.stringify(store.listAudit())).not.toContain(session.cookie);

    const second = await login(app);
    now = new Date('2026-09-04T10:00:00.000Z');
    expect((await app.inject({ url: '/api/admin/auth/session', headers: { cookie: second.cookie } })).statusCode).toBe(401);
  });

  it('throttles repeated attempts before accepting more password work', async () => {
    const { app } = await setup({ attempts: 2 });
    expect((await login(app, 'first-wrong-password')).response.statusCode).toBe(401);
    expect((await login(app, 'second-wrong-password')).response.statusCode).toBe(401);
    expect((await login(app)).response.statusCode).toBe(429);
  });
});

describe('authenticated editorial API', () => {
  it('requires origin, JSON, CSRF and an optimistic precondition', async () => {
    const { app } = await setup();
    const session = await login(app);
    const baseHeaders = { cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrf };
    const request = { method: 'POST' as const, url: '/api/admin/topics', payload: { id: 'retirement-day', content: content() } };
    expect((await app.inject({ ...request, headers: baseHeaders })).statusCode).toBe(403);
    expect((await app.inject({ ...request, headers: { ...baseHeaders, origin: ORIGIN, 'content-type': 'text/plain' } })).statusCode).toBe(415);
    expect((await app.inject({ ...request, headers: { ...baseHeaders, origin: ORIGIN, 'x-csrf-token': 'wrong' } })).statusCode).toBe(403);

    const created = await app.inject({ ...request, headers: { ...baseHeaders, origin: ORIGIN } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ editVersion: 1, topic: { id: 'retirement-day', status: 'draft', sources: [] } });
    const patchUrl = '/api/admin/topics/retirement-day/revisions/1';
    expect((await app.inject({ method: 'PATCH', url: patchUrl, headers: { ...baseHeaders, origin: ORIGIN }, payload: { content: content('退休以后，一天可以怎样重新安排') } })).statusCode).toBe(400);
    const changed = await app.inject({ method: 'PATCH', url: patchUrl, headers: { ...baseHeaders, origin: ORIGIN, 'if-match': '1' },
      payload: { content: content('退休以后，一天可以怎样重新安排') } });
    expect(changed.json()).toMatchObject({ editVersion: 2, topic: { title: '退休以后，一天可以怎样重新安排' } });
    expect((await app.inject({ method: 'PATCH', url: patchUrl, headers: { ...baseHeaders, origin: ORIGIN, 'if-match': '1' },
      payload: { content: content('这个标题会产生编辑冲突') } })).statusCode).toBe(409);
  });

  it('publishes into a slot, rejects overlap, exposes history/audit, corrects and archives', async () => {
    const { app } = await setup();
    const session = await login(app);
    const headers = { origin: ORIGIN, cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrf };
    for (const id of ['topic-one', 'topic-two']) {
      expect((await app.inject({ method: 'POST', url: '/api/admin/topics', headers, payload: { id, status: 'candidate', content: content() } })).statusCode).toBe(201);
    }
    const publish = (id: string, slot: number, startsAt: string, endsAt: string | null) => app.inject({ method: 'POST',
      url: `/api/admin/topics/${id}/revisions/1/publish`, headers: { ...headers, 'if-match': '1' }, payload: { slot, startsAt, endsAt } });
    expect((await publish('topic-one', 2, '2026-09-04T08:00:00.000Z', '2026-10-01T00:00:00.000Z')).statusCode).toBe(200);
    expect((await publish('topic-two', 2, '2026-09-15T00:00:00.000Z', null)).statusCode).toBe(409);
    expect((await app.inject('/api/topics')).json().topics.map((item: { id: string }) => item.id)).toEqual(['topic-one']);

    const correction = await app.inject({ method: 'POST', url: '/api/admin/topics/topic-one/revisions/1/correct',
      headers: { ...headers, 'if-match': '2' }, payload: {} });
    expect(correction.statusCode).toBe(201);
    expect(correction.json()).toMatchObject({ editVersion: 1, topic: { revision: 2, status: 'candidate' } });
    const archive = await app.inject({ method: 'POST', url: '/api/admin/topics/topic-one/revisions/1/archive',
      headers: { ...headers, 'if-match': '2' }, payload: {} });
    expect(archive.json()).toMatchObject({ topic: { revision: 3, status: 'archived' } });
    expect((await app.inject('/api/topics')).json().topics).toEqual([]);
    expect((await app.inject({ url: '/api/admin/topics/topic-one/revisions', headers: { cookie: session.cookie } })).json().revisions).toHaveLength(3);
    const audit = await app.inject({ url: '/api/admin/audit', headers: { cookie: session.cookie } });
    expect(audit.json().entries.map((entry: { action: string }) => entry.action)).toEqual(expect.arrayContaining(['topic.publish', 'topic.correct.create', 'topic.archive']));
    expect(audit.body).not.toContain(PASSWORD);
  });
});
