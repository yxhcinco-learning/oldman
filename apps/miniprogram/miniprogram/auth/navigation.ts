import { miniServices } from '../services';
import { bindSocialReturn, discardSocialReturn, saveCancelledContext, socialUrl, type SocialReturn } from '../social/intent';

type Services = ReturnType<typeof miniServices>;
export interface LoginReturn {
  url: string;
  workId?: string;
  source?: Services;
  social?: SocialReturn;
}
let destination: LoginReturn | undefined;
let opening = false;

/** Keep only an app-owned destination; content stays in its original repository. */
export async function openLogin(target?: LoginReturn) {
  if (opening) return;
  opening = true;
  destination = target;
  try { await wx.reLaunch({ url: '/pages/login/index?return=1' }); }
  catch (error) { destination = undefined; throw error; }
  finally { opening = false; }
}

export function clearLoginReturn() { destination = undefined; discardSocialReturn(); }
export function hasSocialLoginReturn() { return Boolean(destination?.social); }
export function prepareSocialLoginAttempt(generation: number) { if (destination?.social) destination.social.loginGeneration = generation + 1; }
export async function cancelSocialLogin() {
  const target = destination?.social;
  clearLoginReturn();
  if (target) { saveCancelledContext(target, miniServices().account.snapshot().generation); await wx.reLaunch({ url: socialUrl(target) }); }
}
export function socialLoginReason() {
  const kind = destination?.social?.intent.kind;
  return kind ? ({ like: '登录后，为喜欢的文字点个赞。', collect: '登录后，把这篇文章加入您的收藏。', follow: '登录后，关注这位作者。', comment: '登录后保留草稿，由您再次确认发布。', gift: '登录后领取小花花，由您再次确认赠送。', read: '这篇文章需要登录后阅读。', report: '登录后可继续举报这条评论。' })[kind] : '';
}

export async function resolveLoginReturn(target: LoginReturn | undefined, services: Services): Promise<string> {
  if (!target) return '/pages/home/index';
  if (target.social) return socialUrl(target.social);
  if (!target.workId || !target.source) return target.url;
  const owner = services.repository.accountId;
  if (!owner || target.source.repository.accountId && target.source.repository.accountId !== owner) return '/pages/works/index';
  const original = await target.source.repository.getAggregate(target.workId);
  if (!original && !target.source.repository.accountId && target.url.startsWith('/pages/editor/index?')) {
    return '/pages/editor/index' + (target.url.includes('xiaowen=compose') ? '?xiaowen=compose' : '');
  }
  const claim = original?.cloud?.claim;
  const id = target.source.repository.accountId === owner ? target.workId
    : claim?.accountId === owner && claim.complete ? claim.targetId : undefined;
  if (!id || !await services.repository.getAggregate(id)) return '/pages/works/index';
  return target.url.replace(`id=${encodeURIComponent(target.workId)}`, `id=${encodeURIComponent(id)}`);
}

export async function finishLogin(isActive: () => boolean) {
  const services = miniServices();
  const target = destination;
  const url = await resolveLoginReturn(target, services);
  if (!isActive() || services !== miniServices()) return;
  if (target?.social) {
    const state = services.account.snapshot();
    if (state.status !== 'authenticated' || !state.account) return;
    bindSocialReturn(target.social, state.account.id, state.generation);
  }
  destination = undefined;
  await wx.reLaunch({ url });
}
