import { z } from 'zod';
import { articleText, newId, type Draft } from './writing';

const id = z.string().min(1).max(128);
export const aiActionSchema = z.enum(['regular', 'polish', 'question', 'rewrite', 'chat']);
export type AiAction = z.infer<typeof aiActionSchema>;
export const ACTION_LABELS: Record<AiAction, string> = {
  regular: '常规优化', polish: '润色文笔', question: '文字追问', rewrite: '对话调整', chat: '调整文章',
};
export const versionSchema = z.object({
  id, createdAt: z.iso.datetime(), source: z.enum(['baseline', 'manual', 'regular', 'polish', 'rewrite', 'restore']),
  title: z.string().max(120), body: z.string().max(1_000_000),
}).strict();
export type ArticleVersion = z.infer<typeof versionSchema>;
export const VERSION_LABELS: Record<ArticleVersion['source'], string> = {
  baseline: '开始记录', manual: '手动编辑', regular: '常规优化', polish: '润色文笔', rewrite: '对话调整', restore: '恢复内容',
};
export const aiResultSchema = z.object({
  answer: z.string().trim().min(1).max(8000), body: z.string().min(1).max(20000).optional(),
  citedVersionIds: z.array(id).max(20).default([]),
}).strict();
export type AiResult = z.infer<typeof aiResultSchema>;
export function resultSummary(result: AiResult, originalBody: string): string {
  return result.body === originalBody ? '本次保留原文，未产生正文修改。' : result.answer;
}
export const turnSchema = z.object({
  id, createdAt: z.iso.datetime(), action: aiActionSchema, prompt: z.string().max(2000), inputVersionId: id,
  status: z.enum(['running', 'ready', 'applied', 'dismissed', 'answered', 'failed', 'cancelled']),
  result: aiResultSchema.optional(), appliedVersionId: id.optional(), error: z.string().max(1000).optional(),
  omittedRecords: z.number().int().nonnegative().optional(),
}).strict();
export type AiTurn = z.infer<typeof turnSchema>;
export const articleSessionSchema = z.object({
  workId: id, versions: z.array(versionSchema).min(1).max(10000), turns: z.array(turnSchema).max(10000),
}).strict().superRefine((session, ctx) => {
  const versions = new Set(session.versions.map(v => v.id));
  if (versions.size !== session.versions.length || new Set(session.turns.map(t => t.id)).size !== session.turns.length) {
    ctx.addIssue({ code: 'custom', message: '重复的会话标识' });
  }
  for (const turn of session.turns) {
    if (!versions.has(turn.inputVersionId) || (turn.appliedVersionId && !versions.has(turn.appliedVersionId)) ||
      turn.result?.citedVersionIds.some(ref => !versions.has(ref))) ctx.addIssue({ code: 'custom', message: '无效的版本引用' });
    if (['ready', 'applied'].includes(turn.status) && (turn.action === 'question' || !turn.result?.body?.trim())) {
      ctx.addIssue({ code: 'custom', message: '无效的优化结果' });
    }
    if (turn.status === 'applied' && !turn.appliedVersionId) ctx.addIssue({ code: 'custom', message: '缺少应用版本' });
    if (turn.status === 'answered' && (!['question', 'chat'].includes(turn.action) || !turn.result || Boolean(turn.result.body))) {
      ctx.addIssue({ code: 'custom', message: '无效的追问结果' });
    }
  }
});
export type ArticleSession = z.infer<typeof articleSessionSchema>;
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
  return recoverSession({ workId, versions: session.versions.map(v => ({ ...v, id: ids.get(v.id)! })), turns: session.turns.map(t => ({
    ...t, id: newId(), inputVersionId: ids.get(t.inputVersionId)!,
    ...(t.appliedVersionId ? { appliedVersionId: ids.get(t.appliedVersionId)! } : {}),
    ...(t.result ? { result: { ...t.result, citedVersionIds: t.result.citedVersionIds.map(ref => ids.get(ref)!) } } : {}),
  })) });
}
