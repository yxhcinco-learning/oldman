// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotTopic, writingTopicSchema, type WritingTopic } from '../lib/domain/topics';
import { createGateway } from '../server/gateway';
import { REVIEWED_TOPIC_CATALOG, TopicEditorialQueue, validateTopicSourceHosts } from '../server/topic-catalog';

const apps: Awaited<ReturnType<typeof createGateway>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
const candidate = (): WritingTopic => ({
  ...structuredClone(REVIEWED_TOPIC_CATALOG[0]), id: 'candidate-topic', revision: 1, status: 'candidate',
  publishedAt: null, reviewedAt: null, reviewedBy: null, expiresAt: null,
});

describe('reviewed topic contract', () => {
  it('ships twenty reviewed cards across current, periodic and slow columns', () => {
    expect(REVIEWED_TOPIC_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(new Set(REVIEWED_TOPIC_CATALOG.map(item => item.id)).size).toBe(REVIEWED_TOPIC_CATALOG.length);
    expect(new Set(REVIEWED_TOPIC_CATALOG.map(item => item.kind))).toEqual(new Set(['current', 'periodic', 'slow']));
    for (const item of REVIEWED_TOPIC_CATALOG) {
      expect(writingTopicSchema.parse(item)).toEqual(item); expect(item.sources.length).toBeGreaterThan(0); expect(item.angles.length).toBeGreaterThan(0);
      expect(() => validateTopicSourceHosts(item)).not.toThrow();
    }
  });
  it('rejects missing publication evidence, unsafe sources and malformed corrections', () => {
    expect(writingTopicSchema.safeParse({ ...REVIEWED_TOPIC_CATALOG[0], reviewedAt: null }).success).toBe(false);
    expect(() => validateTopicSourceHosts({ ...REVIEWED_TOPIC_CATALOG[0], sources: [{ ...REVIEWED_TOPIC_CATALOG[0].sources[0], url: 'https://unknown.example/story' }] })).toThrow(/允许清单/);
    expect(writingTopicSchema.safeParse({ ...REVIEWED_TOPIC_CATALOG[0], status: 'corrected', correctionNote: undefined }).success).toBe(false);
    expect(writingTopicSchema.safeParse({ ...REVIEWED_TOPIC_CATALOG[0], expiresAt: '2020-01-01T00:00:00.000Z' }).success).toBe(false);
  });
  it('creates an immutable writing snapshot without editorial state', () => {
    const snapshot = snapshotTopic(REVIEWED_TOPIC_CATALOG[0], '2026-08-31T09:00:00.000Z');
    expect(snapshot).toMatchObject({ id: REVIEWED_TOPIC_CATALOG[0].id, revision: 1, capturedAt: '2026-08-31T09:00:00.000Z' });
    expect(snapshot).not.toHaveProperty('status'); expect(snapshot).not.toHaveProperty('reviewedBy');
  });
});

describe('editorial queue and read-only API', () => {
  it('keeps candidates private until a human publishes and supports rejection/correction', () => {
    const queue = new TopicEditorialQueue([]); const draft = candidate(); queue.submit(draft);
    expect(queue.listPublished({ now: new Date('2026-08-31') })).toEqual([]);
    expect(queue.publish(draft.id, 1, '审核员', '2026-08-31T10:00:00.000Z').status).toBe('published');
    expect(queue.listPublished({ now: new Date('2026-09-01') })).toHaveLength(1);
    const rejected = { ...candidate(), id: 'rejected-topic' }; queue.submit(rejected); expect(queue.reject(rejected.id, 1).status).toBe('rejected');
    const correction = { ...queue.getPublished(draft.id, new Date('2026-09-01'))!, revision: 2, status: 'corrected' as const,
      updatedAt: '2026-09-01T00:00:00.000Z', correctionNote: '补充来源时间。' };
    expect(queue.correct(correction).revision).toBe(2); expect(queue.getPublished(draft.id, new Date('2026-09-02'))?.correctionNote).toBe('补充来源时间。');
  });
  it('exposes only bounded reviewed topics with cache headers and no user content', async () => {
    const app = await createGateway({ origin: 'http://localhost:3001' }); apps.push(app); await app.ready();
    const list = await app.inject({ url: '/api/topics?limit=3', headers: { origin: 'http://localhost:3001' } });
    expect(list.statusCode).toBe(200); expect(list.json().topics).toHaveLength(3); expect(list.headers['cache-control']).toContain('max-age=300');
    expect(list.body).not.toContain('textDraft'); expect(list.body).not.toContain('interview-answer');
    const detail = await app.inject({ url: `/api/topics/${list.json().topics[0].id}`, headers: { origin: 'http://localhost:3001' } });
    expect(detail.statusCode).toBe(200); expect(detail.json().sources[0].url).toMatch(/^https:/);
    expect((await app.inject({ url: '/api/topics?limit=21', headers: { origin: 'http://localhost:3001' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/topics', headers: { origin: 'https://foreign.example' } })).statusCode).toBe(403);
    expect((await app.inject('/api/topics/missing-topic')).statusCode).toBe(404);
  });
});
