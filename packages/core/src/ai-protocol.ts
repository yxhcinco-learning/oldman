import { z } from 'zod';
import { aiActionSchema, aiResultSchema, turnSchema, versionSchema, type AiAction, type ArticleSession } from './article-ai.js';
import { topicSnapshotSchema, writingMaterialSchema, type TopicSnapshot, type WritingMaterial } from './topics.js';

const zodParseContext = { jitless: true } as const;

export const MAX_ARTICLE_CHARS = 12000;
export const MAX_CONTEXT_CHARS = 120000;
export const aiRequestSchema = z.object({
  workId: z.string().min(1).max(128), requestId: z.string().min(1).max(128),
  action: aiActionSchema, prompt: z.string().max(2000),
  current: versionSchema.extend({ body: z.string().max(MAX_ARTICLE_CHARS) }),
  versions: z.array(versionSchema).max(32), turns: z.array(turnSchema).max(16),
  topicSnapshot: topicSnapshotSchema.optional(), materials: z.array(writingMaterialSchema).max(24),
  omittedRecords: z.number().int().nonnegative(), omittedMaterials: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  const hasBody = Boolean(value.current.body.trim());
  const hasContext = hasBody || Boolean(value.topicSnapshot) || value.materials.length > 0;
  if (!['interview', 'compose'].includes(value.action) && !hasBody || value.action === 'interview' && !hasContext || value.action === 'compose' && !value.materials.some(material => material.selected)) {
    ctx.addIssue({ code: 'custom', message: '请输入正文或选择采访素材' });
  }
  if (['question', 'rewrite', 'chat'].includes(value.action) && !value.prompt.trim()) ctx.addIssue({ code: 'custom', message: '请输入问题或调整要求' });
  const ids = [value.current.id, ...value.versions.map(v => v.id)];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '重复版本' });
  if (JSON.stringify(value).length > MAX_CONTEXT_CHARS) ctx.addIssue({ code: 'custom', message: '上下文过长' });
});
export type AiRequest = z.infer<typeof aiRequestSchema>;
export const aiResponseSchema = z.object({
  requestId: z.string().min(1).max(128), result: aiResultSchema,
  usage: z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }).optional(),
}).strict();
export type AiResponse = z.infer<typeof aiResponseSchema>;

/** The full local archive is retained; only a bounded selection crosses the network. */
export function buildAiRequest(session: ArticleSession, action: AiAction, prompt: string, requestId: string, context: { topicSnapshot?: TopicSnapshot | null; materials?: WritingMaterial[] } = {}): AiRequest {
  const current = session.versions.at(-1)!;
  const contextual = ['interview', 'compose'].includes(action);
  const candidates = contextual ? (context.materials ?? []).filter(material => action !== 'compose' || material.selected).slice(-24) : [];
  const request: AiRequest = { workId: session.workId, requestId, action, prompt, current, versions: [], turns: [],
    ...(contextual && context.topicSnapshot ? { topicSnapshot: context.topicSnapshot } : {}), materials: [], omittedRecords: 0, omittedMaterials: 0 };
  for (const material of candidates) {
    const next = { ...request, materials: [...request.materials, material] };
    if (JSON.stringify(next).length < MAX_CONTEXT_CHARS - 128) request.materials = next.materials;
  }
  request.omittedMaterials = candidates.length - request.materials.length;
  const eligibleTurns = session.turns.filter(t => t.id !== requestId && t.status !== 'running');
  for (const turn of eligibleTurns.slice(-16).reverse()) {
    const next = { ...request, turns: [turn, ...request.turns] };
    if (JSON.stringify(next).length < MAX_CONTEXT_CHARS - 128) request.turns = next.turns;
  }
  const query = prompt.toLocaleLowerCase().replace(/\s/g, '').slice(0, 2000);
  const grams = [...new Set(Array.from({ length: Math.max(0, query.length - 1) }, (_, i) => query.slice(i, i + 2)))];
  const history = session.versions.slice(0, -1);
  const recent = history.slice(-4);
  const ranked = history.filter(v => !recent.includes(v)).map(version => {
    const text = (version.title + version.body).toLocaleLowerCase();
    return { version, score: grams.reduce((sum, gram) => sum + Number(text.includes(gram)), 0) };
  }).sort((a, b) => b.score - a.score || b.version.createdAt.localeCompare(a.version.createdAt));
  for (const version of [...recent.reverse(), ...ranked.map(r => r.version)]) {
    if (request.versions.length === 32) break;
    const next = { ...request, versions: [...request.versions, version] };
    if (JSON.stringify(next).length < MAX_CONTEXT_CHARS - 128) request.versions = next.versions;
  }
  request.versions.sort((a, b) => session.versions.indexOf(a) - session.versions.indexOf(b));
  request.omittedRecords = history.length + eligibleTurns.length - request.versions.length - request.turns.length;
  return aiRequestSchema.parse(request, zodParseContext);
}
