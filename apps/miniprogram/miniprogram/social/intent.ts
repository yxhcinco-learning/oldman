import { cloudIdSchema, newId } from '../domain/core';

export type SocialIntent = { kind: 'like' | 'collect' | 'follow'; target: boolean } | { kind: 'comment'; draft: string } | { kind: 'report'; commentId: string } | { kind: 'gift' } | { kind: 'read' };
export interface ReadingContext { draft: string; scrollTop: number; sheet: string; commentScroll: number; commentPages?: number }
export interface SocialReturn { id: string; page: 'article' | 'author'; intent: SocialIntent; operationId: string; originAccount: string | null; originGeneration: number; loginGeneration?: number; context?: ReadingContext }
let ready: { target: SocialReturn; account: string; generation: number } | undefined;
let cancelled: { target: SocialReturn; generation: number } | undefined;

export function socialReturn(page: 'article' | 'author', id: string, intent: SocialIntent, account: string | null, generation: number): SocialReturn {
  cloudIdSchema.parse(id, { jitless: true });
  if (page === 'author' && !['follow', 'read'].includes(intent.kind)) throw new Error('登录操作无效。');
  if (intent.kind === 'comment' && Array.from(intent.draft).length > 300) throw new Error('评论最多 300 字。');
  if (intent.kind === 'report') cloudIdSchema.parse(intent.commentId, { jitless: true });
  return { page, id, intent, operationId: newId(), originAccount: account, originGeneration: generation };
}
export function socialUrl(target: Pick<SocialReturn, 'page' | 'id'>) { return '/pages/' + target.page + '/index?id=' + encodeURIComponent(target.id); }
export function bindSocialReturn(target: SocialReturn, account: string, generation: number) {
  // Only the initiating account, or the one explicit guest login generation, may resume.
  const expected = target.loginGeneration ?? (target.originAccount ? target.originGeneration : target.originGeneration + 1);
  if ((target.originAccount && target.originAccount !== account) || generation !== expected) { ready = undefined; return; }
  ready = { target, account, generation };
}
export function takeSocialReturn(page: 'article' | 'author', id: string, account: string | null, generation: number) {
  const value = ready; ready = undefined;
  return value && value.account === account && value.generation === generation && value.target.page === page && value.target.id === id ? value.target : undefined;
}
export function discardSocialReturn() { ready = undefined; cancelled = undefined; }
export function saveCancelledContext(target: SocialReturn, generation: number) { cancelled = { target, generation }; }
export function takeCancelledContext(id: string, account: string | null, generation: number) {
  const value = cancelled; cancelled = undefined;
  return value && value.target.id === id && value.generation === generation && (!value.target.originAccount || value.target.originAccount === account) ? value.target.context : undefined;
}
