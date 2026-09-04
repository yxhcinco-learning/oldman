// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { topicGenerationRequestSchema, writingTopicSchema, type WritingTopic } from '../lib/domain/topics';
import { REVIEWED_TOPIC_CATALOG } from '../server/topic-catalog';
import { TopicStore, TopicStoreError } from '../server/topic-store';

const resources: Array<{ store?: TopicStore; directory: string }> = [];
const NOW = new Date('2026-09-04T08:00:00.000Z');

async function setup(seed = true) {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-topics-'));
  const path = join(directory, 'topics.sqlite');
  const store = new TopicStore({ path, ...(seed ? { seed: REVIEWED_TOPIC_CATALOG } : {}), now: () => NOW });
  resources.push({ store, directory });
  return { store, path, directory };
}

afterEach(async () => {
  const pending = resources.splice(0);
  for (const resource of pending) resource.store?.close();
  for (const directory of new Set(pending.map(resource => resource.directory))) await rm(directory, { recursive: true, force: true });
});

function candidate(id = 'new-topic', revision = 1): WritingTopic {
  return writingTopicSchema.parse({
    id, revision, status: 'candidate', kind: 'slow', title: '退休以后，怎样重新安排一天',
    summary: '退休后的时间不再由单位日程安排，每个人都需要重新找到舒服、稳定又有弹性的生活节奏。',
    whyItMatters: '这个话题能够从具体日常进入，让不同经历的人表达自己的选择。', updatedAt: NOW.toISOString(),
    publishedAt: null, expiresAt: null, sources: [],
    angles: [{ id: 'angle-1', title: '一天从什么时候开始', prompt: '一天从什么时候开始，哪些习惯保留了下来' }],
    starterQuestion: '退休后的第一个月，您最不习惯的是什么？', tags: ['退休生活'], reviewedBy: null, reviewedAt: null,
  });
}

describe('话题共享契约', () => {
  it('允许零来源并约束生成引子组合', () => {
    expect(writingTopicSchema.parse(candidate()).sources).toEqual([]);
    expect(topicGenerationRequestSchema.safeParse({ brief: '从退休后的时间安排谈起', urls: [], webSearchEnabled: false }).success).toBe(true);
    expect(topicGenerationRequestSchema.safeParse({ brief: '', urls: ['https://example.com/story'], webSearchEnabled: true }).success).toBe(true);
    expect(topicGenerationRequestSchema.safeParse({ brief: '', urls: ['https://example.com/story'], webSearchEnabled: false }).success).toBe(false);
  });
});

describe('话题 SQLite 仓储', () => {
  it('幂等导入21条种子并建立五个显式席位', async () => {
    const { store, path, directory } = await setup();
    expect(store.statistics()).toMatchObject({ topics: 21, revisions: 21, placements: 5, schemaVersion: 1, journalMode: 'wal' });
    expect(store.listHome({ now: NOW })).toHaveLength(5);
    const firstIds = store.listHome({ now: NOW }).map(item => item.id);
    store.close();
    const reopened = new TopicStore({ path, seed: REVIEWED_TOPIC_CATALOG, now: () => NOW });
    resources.push({ store: reopened, directory });
    expect(reopened.statistics()).toMatchObject({ topics: 21, revisions: 21, placements: 5 });
    expect(reopened.listHome({ now: NOW }).map(item => item.id)).toEqual(firstIds);
    reopened.assertIntegrity();
  });

  it('保存零来源候选、拒绝过期编辑并冻结正式修订', async () => {
    const { store } = await setup(false);
    const created = store.createEditable(candidate(), 'editor', '退休以后的一天');
    expect(created.editVersion).toBe(1);
    const updatedTopic = { ...created.topic, title: '退休以后，一天可以怎样重新安排' };
    expect(store.updateEditable(updatedTopic, 1, 'editor').editVersion).toBe(2);
    expect(() => store.updateEditable(updatedTopic, 1, 'editor')).toThrowError(expect.objectContaining<Partial<TopicStoreError>>({ category: 'conflict' }));
    const formal = store.publishAndSchedule('new-topic', 1, 2, 'editor', {
      slot: 1, topicId: 'new-topic', revision: 1, startsAt: '2026-09-05T00:00:00.000Z', endsAt: null,
    });
    expect(formal.topic.status).toBe('published');
    expect(store.getPublished('new-topic', NOW)).toBeUndefined();
    expect(store.getPublished('new-topic', new Date('2026-09-05T00:00:00.000Z'))?.sources).toEqual([]);
    expect(() => store.updateEditable(formal.topic, formal.editVersion, 'editor')).toThrowError(expect.objectContaining<Partial<TopicStoreError>>({ category: 'invalid_state' }));
  });

  it('原子拒绝重叠排期并支持更正和提前下线', async () => {
    const { store } = await setup(false);
    store.createEditable(candidate('topic-one'), 'editor');
    store.publishAndSchedule('topic-one', 1, 1, 'editor', {
      slot: 4, topicId: 'topic-one', revision: 1, startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z',
    });
    store.createEditable(candidate('topic-two'), 'editor');
    expect(() => store.publishAndSchedule('topic-two', 1, 1, 'editor', {
      slot: 4, topicId: 'topic-two', revision: 1, startsAt: '2026-10-15T00:00:00.000Z', endsAt: null,
    })).toThrowError(expect.objectContaining<Partial<TopicStoreError>>({ category: 'conflict' }));
    expect(store.getRevision('topic-two', 1)?.topic.status).toBe('candidate');
    const correction = store.createCorrection('topic-one', 'editor');
    expect(correction.topic).toMatchObject({ revision: 2, status: 'candidate', correctionNote: '请填写更正说明' });
    const archived = store.archive('topic-one', 1, 'editor');
    expect(archived.topic).toMatchObject({ revision: 3, status: 'archived' });
    expect(store.getPublished('topic-one', new Date('2026-10-15T00:00:00.000Z'))).toBeUndefined();
    expect(store.listAudit().map(item => item.action)).toEqual(expect.arrayContaining(['topic.publish', 'topic.correct.create', 'topic.archive']));
  });

  it('拒绝比当前程序更新的 schema', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'suiyue-topics-newer-'));
    resources.push({ directory });
    const path = join(directory, 'topics.sqlite');
    const database = new DatabaseSync(path);
    database.exec('PRAGMA user_version = 2');
    database.close();
    expect(() => new TopicStore({ path })).toThrow(/newer than this release/);
  });
});
