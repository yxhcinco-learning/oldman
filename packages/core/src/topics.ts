import { z } from 'zod';

const id = z.string().min(1).max(128);
const httpUrl = z.string().url().max(2048).refine(value => /^https?:\/\//i.test(value), '来源必须使用 HTTP(S)');

export const topicSourceSchema = z.object({
  id, title: z.string().trim().min(1).max(180), publisher: z.string().trim().min(1).max(80),
  url: httpUrl, publishedAt: z.iso.datetime(),
}).strict();
export type TopicSource = z.infer<typeof topicSourceSchema>;

export const topicAngleSchema = z.object({
  id, title: z.string().trim().min(1).max(60), prompt: z.string().trim().min(1).max(300),
}).strict();
export type TopicAngle = z.infer<typeof topicAngleSchema>;

export const topicStatusSchema = z.enum(['draft', 'candidate', 'rejected', 'published', 'corrected', 'archived']);
export const topicKindSchema = z.enum(['current', 'periodic', 'slow']);
export type TopicKind = z.infer<typeof topicKindSchema>;
export const writingTopicSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96), revision: z.number().int().positive(),
  status: topicStatusSchema, kind: topicKindSchema, title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(20).max(800), whyItMatters: z.string().trim().min(10).max(400),
  updatedAt: z.iso.datetime(), publishedAt: z.iso.datetime().nullable(), expiresAt: z.iso.datetime().nullable(),
  sources: z.array(topicSourceSchema).min(1).max(5), angles: z.array(topicAngleSchema).min(1).max(4),
  starterQuestion: z.string().trim().min(5).max(300), tags: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
  reviewedBy: z.string().trim().min(1).max(80).nullable(), reviewedAt: z.iso.datetime().nullable(),
  correctionNote: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine((topic, ctx) => {
  const sourceIds = new Set(topic.sources.map(source => source.id));
  const angleIds = new Set(topic.angles.map(angle => angle.id));
  if (sourceIds.size !== topic.sources.length) ctx.addIssue({ code: 'custom', message: '重复的来源标识' });
  if (angleIds.size !== topic.angles.length) ctx.addIssue({ code: 'custom', message: '重复的角度标识' });
  if (topic.expiresAt && new Date(topic.expiresAt) <= new Date(topic.updatedAt)) ctx.addIssue({ code: 'custom', message: '议题有效期无效' });
  if (['published', 'corrected'].includes(topic.status) && (!topic.publishedAt || !topic.reviewedAt || !topic.reviewedBy)) {
    ctx.addIssue({ code: 'custom', message: '正式议题缺少审核发布记录' });
  }
  if (topic.status === 'corrected' && !topic.correctionNote) ctx.addIssue({ code: 'custom', message: '更正议题缺少说明' });
});
export type WritingTopic = z.infer<typeof writingTopicSchema>;

export const topicSnapshotSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96), revision: z.number().int().positive(),
  kind: topicKindSchema, title: z.string().trim().min(1).max(120), summary: z.string().trim().min(20).max(800),
  whyItMatters: z.string().trim().min(10).max(400), updatedAt: z.iso.datetime(), sources: z.array(topicSourceSchema).min(1).max(5),
  angles: z.array(topicAngleSchema).min(1).max(4), starterQuestion: z.string().trim().min(5).max(300),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(8), correctionNote: z.string().trim().min(1).max(500).optional(),
  capturedAt: z.iso.datetime(),
}).strict();
export type TopicSnapshot = z.infer<typeof topicSnapshotSchema>;

export const writingMaterialSchema = z.object({
  id, source: z.enum(['user-note', 'interview-answer']), text: z.string().trim().min(1).max(12000),
  question: z.string().trim().min(1).max(500).optional(), createdAt: z.iso.datetime(), selected: z.boolean(),
}).strict();
export type WritingMaterial = z.infer<typeof writingMaterialSchema>;
export type TopicWritingMode = 'normal' | 'interview';

export function snapshotTopic(topic: WritingTopic, capturedAt = new Date().toISOString()): TopicSnapshot {
  return topicSnapshotSchema.parse({
    id: topic.id, revision: topic.revision, kind: topic.kind, title: topic.title, summary: topic.summary,
    whyItMatters: topic.whyItMatters, updatedAt: topic.updatedAt, sources: topic.sources, angles: topic.angles,
    starterQuestion: topic.starterQuestion, tags: topic.tags, ...(topic.correctionNote ? { correctionNote: topic.correctionNote } : {}), capturedAt,
  });
}

export function isTopicCurrent(topic: WritingTopic, now = new Date()) {
  return ['published', 'corrected'].includes(topic.status) && (!topic.expiresAt || new Date(topic.expiresAt) > now);
}

export function selectHomeTopics(topics: WritingTopic[], limit = 5) {
  const selected: WritingTopic[] = [];
  const take = (kind: TopicKind, count: number) => {
    for (const topic of topics) {
      if (selected.length >= limit || count <= 0) break;
      if (topic.kind === kind && !selected.some(item => item.id === topic.id)) { selected.push(topic); count--; }
    }
  };
  take('current', 2); take('periodic', 2); take('slow', 1);
  for (const topic of topics) {
    if (selected.length >= limit) break;
    if (!selected.some(item => item.id === topic.id)) selected.push(topic);
  }
  return selected;
}
