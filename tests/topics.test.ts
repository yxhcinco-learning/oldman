// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { snapshotTopic, writingTopicSchema } from '../lib/domain/topics';
import { createGateway } from '../server/gateway';
import { REVIEWED_TOPIC_CATALOG } from '../server/topic-catalog';
import { loadTopicRuntime } from '../server/topic-runtime';
import { TopicStore } from '../server/topic-store';

const NOW = new Date('2026-09-04T08:00:00.000Z');
const resources: Array<{ app: Awaited<ReturnType<typeof createGateway>>; store?: TopicStore }> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.app.close();
    resource.store?.close();
  }
});

async function gateway(withTopics = true) {
  const store = withTopics ? new TopicStore({ path: ':memory:', seed: REVIEWED_TOPIC_CATALOG, now: () => NOW }) : undefined;
  const app = await createGateway({ origin: 'http://localhost:3001', ...(store ? { topics: store } : {}) });
  resources.push({ app, store });
  await app.ready();
  return app;
}

async function gatewayWithStore(store: TopicStore) {
  const app = await createGateway({ origin: 'http://localhost:3001', topics: store });
  resources.push({ app, store });
  await app.ready();
  return app;
}

describe('reviewed topic contract', () => {
  it('keeps the 21 reviewed records as migration seeds', () => {
    expect(REVIEWED_TOPIC_CATALOG).toHaveLength(21);
    expect(new Set(REVIEWED_TOPIC_CATALOG.map(item => item.id)).size).toBe(21);
    expect(new Set(REVIEWED_TOPIC_CATALOG.map(item => item.kind))).toEqual(new Set(['current', 'periodic', 'slow']));
    for (const item of REVIEWED_TOPIC_CATALOG) {
      expect(writingTopicSchema.parse(item)).toEqual(item);
      expect(item.angles.length).toBeGreaterThan(0);
    }
  });

  it('accepts reviewed content without sources and still validates formal revisions', () => {
    const noSources = { ...REVIEWED_TOPIC_CATALOG[0], sources: [] };
    expect(writingTopicSchema.parse(noSources).sources).toEqual([]);
    expect(writingTopicSchema.safeParse({ ...noSources, reviewedAt: null }).success).toBe(false);
    expect(writingTopicSchema.safeParse({ ...noSources, status: 'corrected', correctionNote: undefined }).success).toBe(false);
    expect(writingTopicSchema.safeParse({ ...noSources, expiresAt: '2020-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('creates an immutable writing snapshot without editorial state', () => {
    const snapshot = snapshotTopic(REVIEWED_TOPIC_CATALOG[0], '2026-08-31T09:00:00.000Z');
    expect(snapshot).toMatchObject({ id: REVIEWED_TOPIC_CATALOG[0].id, revision: 1, capturedAt: '2026-08-31T09:00:00.000Z' });
    expect(snapshot).not.toHaveProperty('status');
    expect(snapshot).not.toHaveProperty('reviewedBy');
  });
});

describe('SQLite-backed read-only API', () => {
  it('returns only explicit active placements in their manual slot order', async () => {
    const app = await gateway();
    const list = await app.inject({ url: '/api/topics?limit=5', headers: { origin: 'http://localhost:3001' } });
    expect(list.statusCode).toBe(200);
    expect(list.json().topics).toHaveLength(5);
    expect(list.json().topics.map((item: { id: string }) => item.id)).toEqual(resources[0].store!.listHome().map(item => item.id));
    expect(list.headers['cache-control']).toContain('max-age=60');
    expect(list.body).not.toContain('textDraft');
    expect(list.body).not.toContain('interview-answer');

    const detail = await app.inject({ url: `/api/topics/${list.json().topics[0].id}`, headers: { origin: 'http://localhost:3001' } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual(list.json().topics[0]);
    expect((await app.inject({ url: '/api/topics?limit=6', headers: { origin: 'http://localhost:3001' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/topics', headers: { origin: 'https://foreign.example' } })).statusCode).toBe(403);
    expect((await app.inject('/api/topics/missing-topic')).statusCode).toBe(404);
  });

  it('fails closed when the topic database is unavailable without affecting health', async () => {
    const app = await gateway(false);
    expect((await app.inject('/api/topics')).statusCode).toBe(503);
    expect((await app.inject('/api/topics/known-topic')).statusCode).toBe(503);
    expect((await app.inject('/api/health')).json()).toMatchObject({ status: 'ok', topicsConfigured: false });
  });

  it('allows fewer than five active topics and returns a published detail with no source section data', async () => {
    const store = new TopicStore({ path: ':memory:', now: () => NOW });
    const topic = writingTopicSchema.parse({
      ...REVIEWED_TOPIC_CATALOG[0], id: 'source-free-topic', status: 'candidate', sources: [], updatedAt: NOW.toISOString(),
      publishedAt: null, expiresAt: null, reviewedBy: null, reviewedAt: null,
    });
    store.createEditable(topic, 'editor');
    store.publishAndSchedule(topic.id, 1, 1, 'editor', {
      slot: 3, topicId: topic.id, revision: 1, startsAt: NOW.toISOString(), endsAt: null,
    });
    const app = await gatewayWithStore(store);
    const list = await app.inject('/api/topics');
    expect(list.json().topics).toHaveLength(1);
    expect(list.json().topics[0]).toMatchObject({ id: topic.id, sources: [] });
    expect((await app.inject(`/api/topics/${topic.id}`)).json()).toMatchObject({ id: topic.id, sources: [] });
  });
});

describe('topic runtime configuration', () => {
  it('uses an ignored local data directory in development and requires production configuration', () => {
    expect(loadTopicRuntime({ NODE_ENV: 'development' }, 'fixture-workspace').configuration?.databasePath)
      .toBe(resolve('fixture-workspace', '.data', 'topics.sqlite'));
    expect(loadTopicRuntime({ NODE_ENV: 'development', SUIYUE_TOPICS_DB_PATH: '.data/custom-topics.sqlite' }, 'fixture-workspace').configuration?.databasePath)
      .toBe(resolve('fixture-workspace', '.data/custom-topics.sqlite'));
    expect(loadTopicRuntime({ NODE_ENV: 'production' })).toEqual({ problem: '话题数据库路径未配置，热门与后台已关闭。' });
    expect(loadTopicRuntime({ NODE_ENV: 'production', SUIYUE_TOPICS_DB_PATH: 'relative.sqlite' }).problem).toContain('绝对路径');
  });
});
