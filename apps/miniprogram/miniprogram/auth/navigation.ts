import { miniServices } from '../services';

type Services = ReturnType<typeof miniServices>;
export interface LoginReturn {
  url: string;
  workId?: string;
  source?: Services;
}
let destination: LoginReturn | undefined;
let opening = false;

/** Keep only an app-owned destination; content stays in its original repository. */
export async function openLogin(target?: LoginReturn) {
  if (opening) return;
  opening = true;
  destination = target;
  try { await wx.navigateTo({ url: '/pages/login/index?return=1' }); }
  catch (error) { destination = undefined; throw error; }
  finally { opening = false; }
}

export function clearLoginReturn() { destination = undefined; }

export function cancelLogin() {
  const target = destination;
  destination = undefined;
  const url = target?.source && target.source !== miniServices() ? '/pages/works/index'
    : target?.url.replace(/[?&]resume=interview/, '') ?? '/pages/home/index';
  return wx.reLaunch({ url });
}

export async function resolveLoginReturn(target: LoginReturn | undefined, services: Services): Promise<string> {
  if (!target) return '/pages/home/index';
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
  destination = undefined;
  await wx.reLaunch({ url });
}
