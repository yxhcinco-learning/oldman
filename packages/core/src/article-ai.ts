import { z } from 'zod';
import { articleText, newId, type Draft } from './writing.js';

const id = z.string().min(1).max(128);
export const aiActionSchema = z.enum(['regular', 'polish', 'question', 'rewrite', 'chat', 'interview', 'compose', 'dialogue']);
export type AiAction = z.infer<typeof aiActionSchema>;
export const ACTION_LABELS: Record<AiAction, string> = {
  regular: '常规优化', polish: '润色文笔', question: '文字追问', rewrite: '对话调整', chat: '调整文章',
  interview: '小文采访', compose: '整理成文章', dialogue: '与小文对话',
};
export const versionSchema = z.object({
  id, createdAt: z.iso.datetime(), source: z.enum(['baseline', 'manual', 'regular', 'polish', 'rewrite', 'restore']),
  title: z.string().max(120), body: z.string().max(1_000_000),
}).strict();
export type ArticleVersion = z.infer<typeof versionSchema>;
export const VERSION_LABELS: Record<ArticleVersion['source'], string> = {
  baseline: '开始记录', manual: '手动编辑', regular: '常规优化', polish: '润色文笔', rewrite: '对话调整', restore: '恢复内容',
};
export const dialogueCommandSchema = z.enum(['send', 'start', 'finish', 'change', 'confirm-edit']);
export type DialogueCommand = z.infer<typeof dialogueCommandSchema>;
export const conversationMessageSchema = z.object({
  id, role: z.enum(['user', 'assistant', 'system']), text: z.string().min(1).max(12000), turnId: id.optional(),
}).strict();
export const conversationSchema = z.object({
  mode: z.enum(['conversation', 'interview']), messages: z.array(conversationMessageSchema).max(60000),
  materials: z.array(z.object({ id, text: z.string().min(1).max(12000), sourceMessageId: id, supersedes: id.optional() }).strict()).max(10000),
  pendingEdit: z.string().max(12000).optional(),
}).strict().superRefine((value, ctx) => {
  const messages = new Map(value.messages.map(message => [message.id, message]));
  const materials = new Map(value.materials.map(material => [material.id, material]));
  if (messages.size !== value.messages.length || materials.size !== value.materials.length) ctx.addIssue({ code: 'custom', message: '重复会话来源' });
  for (const material of value.materials) {
    const source = messages.get(material.sourceMessageId);
    if (!source || source.role !== 'user' || !source.text.includes(material.text) || material.supersedes === material.id ||
      (material.supersedes && (!materials.has(material.supersedes) || value.materials.indexOf(materials.get(material.supersedes)!) >= value.materials.indexOf(material)))) {
      ctx.addIssue({ code: 'custom', message: '无效素材来源' });
    }
  }
});
export type XiaoWenConversation = z.infer<typeof conversationSchema>;
export const aiResultSchema = z.object({
  answer: z.string().trim().min(1).max(8000), body: z.string().min(1).max(20000).optional(),
  citedVersionIds: z.array(id).max(20).default([]),
  dialogue: z.object({ intent: z.enum(['reply', 'start', 'finish', 'confirm-edit', 'cancel-edit', 'edit']),
    material: z.object({ text: z.string().min(1).max(12000), supersedes: id.optional() }).strict().optional(),
  }).strict().optional(),
}).strict();
export type AiResult = z.infer<typeof aiResultSchema>;
const NON_CHANGE_CLAUSE = /(?:[（(]\s*(?:未变|无变化|无修改)\s*[）)]|保持不变|维持不变|原样保留|无需修改|没有变化|无实际变化)/;
const QUOTED_REPLACEMENT = /[“"]([^”"]+)[”"]\s*(?:改为|修改为|调整为|统一为|替换为)\s*[“"]([^”"]+)[”"]/g;
function normalizedQuote(value: string) { return value.replace(/\s+/g, '').trim(); }
function isNonChangeClause(clause: string) {
  if (NON_CHANGE_CLAUSE.test(clause)) return true;
  const replacements = [...clause.matchAll(QUOTED_REPLACEMENT)];
  return replacements.length > 0 && replacements.every(match => normalizedQuote(match[1]) === normalizedQuote(match[2]));
}
export function actualChangeSummary(answer: string): string {
  const clauses = answer.match(/[^；;。\n]+[；;。\n]?/g) ?? [answer];
  const kept = clauses.filter(clause => !isNonChangeClause(clause)).join('').trim().replace(/[；;]+$/, '。');
  return kept || '已完成本轮整理，请对照原文查看具体变化。';
}
export function resultSummary(result: AiResult, originalBody: string): string {
  if (result.body === originalBody) return '本次保留原文，未产生正文修改。';
  return result.body === undefined ? result.answer : actualChangeSummary(result.answer);
}
export function readableResultSummary(result: AiResult, originalBody: string): string {
  const summary = resultSummary(result, originalBody);
  return result.body === undefined ? summary : summary.replace(/(?:请)?查看候选(?:全文|结果|文章|稿)?/g, '看看文章');
}
export const turnSchema = z.object({
  id, createdAt: z.iso.datetime(), action: aiActionSchema, prompt: z.string().max(12000), inputVersionId: id,
  command: dialogueCommandSchema.optional(),
  status: z.enum(['running', 'ready', 'applied', 'dismissed', 'answered', 'failed', 'cancelled']),
  result: aiResultSchema.optional(), appliedVersionId: id.optional(), error: z.string().max(1000).optional(),
  revertedVersionId: id.optional(),
  omittedRecords: z.number().int().nonnegative().optional(),
}).strict();
export type AiTurn = z.infer<typeof turnSchema>;
export const articleSessionSchema = z.object({
  workId: id, versions: z.array(versionSchema).min(1).max(10000), turns: z.array(turnSchema).max(10000),
  conversation: conversationSchema.optional(),
}).strict().superRefine((session, ctx) => {
  const versions = new Set(session.versions.map(v => v.id));
  if (versions.size !== session.versions.length || new Set(session.turns.map(t => t.id)).size !== session.turns.length) {
    ctx.addIssue({ code: 'custom', message: '重复的会话标识' });
  }
  for (const turn of session.turns) {
    if (!versions.has(turn.inputVersionId) || (turn.appliedVersionId && !versions.has(turn.appliedVersionId)) ||
      (turn.revertedVersionId && (!turn.appliedVersionId || !versions.has(turn.revertedVersionId))) ||
      turn.result?.citedVersionIds.some(ref => !versions.has(ref))) ctx.addIssue({ code: 'custom', message: '无效的版本引用' });
    if (['ready', 'applied'].includes(turn.status) && (['question', 'interview'].includes(turn.action) || !turn.result?.body?.trim())) {
      ctx.addIssue({ code: 'custom', message: '无效的优化结果' });
    }
    if (turn.status === 'applied' && !turn.appliedVersionId) ctx.addIssue({ code: 'custom', message: '缺少应用版本' });
    if (turn.status === 'answered' && (!['question', 'chat', 'interview', 'compose', 'dialogue'].includes(turn.action) || !turn.result || Boolean(turn.result.body))) {
      ctx.addIssue({ code: 'custom', message: '无效的追问结果' });
    }
  }
});
export type ArticleSession = z.infer<typeof articleSessionSchema>;
/** Mode changes and static introductions are context, not authored content. */
export function hasSessionContent(session?: ArticleSession | null): boolean {
  if (!session) return false;
  const conversation = session.conversation;
  return session.turns.length > 0 || session.versions.some(version => Boolean(version.title.trim() || version.body.trim()))
    || Boolean(conversation?.messages.some(message => message.role === 'user' && message.text.trim())
      || conversation?.materials.some(material => material.text.trim()) || conversation?.pendingEdit?.trim());
}
export const AI_ASSISTANCE_LABEL = 'AI 辅助生成 · 请核对';
export const AI_ASSISTANCE_DISCLOSURE = '【AI辅助说明】本文曾应用“小文”AI生成的候选，作者已确认并可能继续修改；请核对事实与细节。';
export const AI_ASSISTANCE_NONE_DISCLOSURE = '未发现已应用的小文 AI 生成候选。';
export const AI_DISCLOSURE_VERSION = 1 as const;
export const aiDisclosureSchema = z.object({
  version: z.literal(AI_DISCLOSURE_VERSION), workId: id, aiAssisted: z.boolean(),
  basis: z.enum(['applied-ai-candidate', 'none']), appliedCandidateCount: z.number().int().nonnegative(),
  notice: z.string().min(1).max(300),
}).strict();
export type AiDisclosure = z.infer<typeof aiDisclosureSchema>;
export function appliedAiTurns(session?: ArticleSession | null): AiTurn[] {
  if (!session) return [];
  const versions = new Set(session.versions.map(version => version.id));
  return session.turns.filter(turn => turn.status === 'applied' && Boolean(turn.result?.body?.trim())
    && Boolean(turn.appliedVersionId && versions.has(turn.appliedVersionId)));
}
export function isWorkAiAssisted(session?: ArticleSession | null): boolean {
  return appliedAiTurns(session).length > 0;
}
export function isAppliedAiVersion(session: ArticleSession | null | undefined, versionId: string): boolean {
  return appliedAiTurns(session).some(turn => turn.appliedVersionId === versionId);
}
export function aiDisclosureFor(workId: string, session?: ArticleSession | null): AiDisclosure {
  const appliedCandidateCount = session?.workId === workId ? appliedAiTurns(session).length : 0;
  const aiAssisted = appliedCandidateCount > 0;
  return { version: AI_DISCLOSURE_VERSION, workId, aiAssisted,
    basis: aiAssisted ? 'applied-ai-candidate' : 'none', appliedCandidateCount,
    notice: aiAssisted ? AI_ASSISTANCE_DISCLOSURE : AI_ASSISTANCE_NONE_DISCLOSURE };
}
export function externalArticleText(body: string, session?: ArticleSession | null): string {
  return isWorkAiAssisted(session) ? `${AI_ASSISTANCE_DISCLOSURE}\n\n${body}` : body;
}
export const documentOf = (draft: Draft) => ({ title: draft.title, body: draft.inputMode === 'text' ? draft.textDraft : articleText(draft.segments) });
export const sameDocument = (a: { title: string; body: string }, b: { title: string; body: string }) => a.title === b.title && a.body === b.body;
export function newVersion(draft: Draft, source: ArticleVersion['source']): ArticleVersion {
  return { id: newId(), createdAt: new Date().toISOString(), source, ...documentOf(draft) };
}
export function newSession(draft: Draft): ArticleSession {
  return { workId: draft.id, versions: [newVersion(draft, 'baseline')], turns: [] };
}
export function checkpointSession(session: ArticleSession, draft: Draft, source: ArticleVersion['source'] = 'manual'): ArticleSession {
  if (sameDocument(session.versions.at(-1)!, documentOf(draft))) return session;
  return { ...session, versions: [...session.versions, newVersion(draft, source)] };
}
export function recoverSession(session: ArticleSession): ArticleSession {
  return { ...session, turns: session.turns.map(turn => turn.status === 'running'
    ? { ...turn, status: 'cancelled', error: '上次请求已中断，未自动重试。' } : turn) };
}
export function copySession(session: ArticleSession, workId: string): ArticleSession {
  const ids = new Map(session.versions.map(version => [version.id, newId()]));
  const turnIds = new Map(session.turns.map(turn => [turn.id, newId()]));
  const messageIds = new Map(session.conversation?.messages.map(message => [message.id, newId()]) ?? []);
  const materialIds = new Map(session.conversation?.materials.map(material => [material.id, newId()]) ?? []);
  const conversation = session.conversation && { ...session.conversation,
    messages: session.conversation.messages.map(message => ({ ...message, id: messageIds.get(message.id)!,
      ...(message.turnId ? { turnId: turnIds.get(message.turnId) } : {}) })),
    materials: session.conversation.materials.map(material => ({ ...material, id: materialIds.get(material.id)!,
      sourceMessageId: messageIds.get(material.sourceMessageId)!, ...(material.supersedes ? { supersedes: materialIds.get(material.supersedes)! } : {}) })),
  };
  return recoverSession({ workId, ...(conversation ? { conversation } : {}), versions: session.versions.map(v => ({ ...v, id: ids.get(v.id)! })), turns: session.turns.map(t => ({
    ...t, id: turnIds.get(t.id)!, inputVersionId: ids.get(t.inputVersionId)!,
    ...(t.appliedVersionId ? { appliedVersionId: ids.get(t.appliedVersionId)! } : {}),
    ...(t.revertedVersionId ? { revertedVersionId: ids.get(t.revertedVersionId)! } : {}),
    ...(t.result ? { result: { ...t.result, citedVersionIds: t.result.citedVersionIds.map(ref => ids.get(ref)!), ...(t.result.dialogue?.material?.supersedes ? { dialogue: { ...t.result.dialogue, material: { ...t.result.dialogue.material, supersedes: materialIds.get(t.result.dialogue.material.supersedes)! } } } : {}) } } : {}),
  })) });
}
