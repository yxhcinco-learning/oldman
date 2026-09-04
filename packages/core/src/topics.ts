import { z } from 'zod';

const zodParseContext = { jitless: true } as const;

const id = z.string().min(1).max(128);
// 微信小程序 JavaScript 运行时并不稳定提供浏览器标准 URL 构造器；
// Zod 的 `.url()` 会因此把服务端返回的合法地址全部判为无效。
// 这里使用不依赖宿主全局对象的完整 HTTP(S) 地址校验；来源事实由内部编辑审核。
export const topicSourceUrlSchema = z.string().trim().max(2048).refine(
  value => /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(value),
  '来源必须使用有效 HTTP(S) 地址',
);

export const topicSourceSchema = z.object({
  id, title: z.string().trim().min(1).max(180), publisher: z.string().trim().min(1).max(80),
  url: topicSourceUrlSchema, publishedAt: z.iso.datetime(),
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
  sources: z.array(topicSourceSchema).max(5), angles: z.array(topicAngleSchema).min(1).max(4),
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
  whyItMatters: z.string().trim().min(10).max(400), updatedAt: z.iso.datetime(), sources: z.array(topicSourceSchema).max(5),
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

export const topicEditableContentSchema = z.object({
  kind: topicKindSchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(20).max(800),
  whyItMatters: z.string().trim().min(10).max(400),
  expiresAt: z.iso.datetime().nullable(),
  sources: z.array(topicSourceSchema).max(5),
  angles: z.array(topicAngleSchema).min(1).max(4),
  starterQuestion: z.string().trim().min(5).max(300),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
  correctionNote: z.string().trim().min(1).max(500).optional(),
}).strict();
export type TopicEditableContent = z.infer<typeof topicEditableContentSchema>;

export const topicGenerationRequestSchema = z.object({
  brief: z.string().trim().max(6000).default(''),
  urls: z.array(topicSourceUrlSchema).max(5).default([]),
  webSearchEnabled: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  if (!value.brief && value.urls.length === 0) ctx.addIssue({ code: 'custom', message: '请提供话题引子或链接' });
  if (!value.brief && value.urls.length > 0 && !value.webSearchEnabled) ctx.addIssue({ code: 'custom', message: '只有链接时需要开启联网搜索或补充文字' });
  if (new Set(value.urls).size !== value.urls.length) ctx.addIssue({ code: 'custom', message: '链接不能重复' });
});
export type TopicGenerationRequest = z.infer<typeof topicGenerationRequestSchema>;

export const topicPlacementSchema = z.object({
  slot: z.number().int().min(1).max(5),
  topicId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96),
  revision: z.number().int().positive(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) ctx.addIssue({ code: 'custom', message: '下线时间必须晚于上线时间' });
});
export type TopicPlacement = z.infer<typeof topicPlacementSchema>;

export function snapshotTopic(topic: WritingTopic, capturedAt = new Date().toISOString()): TopicSnapshot {
  return topicSnapshotSchema.parse({
    id: topic.id, revision: topic.revision, kind: topic.kind, title: topic.title, summary: topic.summary,
    whyItMatters: topic.whyItMatters, updatedAt: topic.updatedAt, sources: topic.sources, angles: topic.angles,
    starterQuestion: topic.starterQuestion, tags: topic.tags, ...(topic.correctionNote ? { correctionNote: topic.correctionNote } : {}), capturedAt,
  }, zodParseContext);
}

export function isTopicCurrent(topic: WritingTopic, now = new Date()) {
  return ['published', 'corrected'].includes(topic.status) && Boolean(topic.publishedAt) && new Date(topic.publishedAt!) <= now &&
    (!topic.expiresAt || new Date(topic.expiresAt) > now);
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
