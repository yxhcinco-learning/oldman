import type { AccountState } from '../auth/account-client';
import type { WorkAggregate } from '../storage/schema';
import type { MiniCloudSync } from './controller';
import { errorMessage } from '../ui/error-message';

/** A cloud receipt confirms only its saved revision, never newer page input. */
export function writingAccess(aggregate: WorkAggregate | null, account: AccountState, sync: MiniCloudSync, saved = true) {
  const cloud = aggregate?.cloud;
  const version = cloud?.version ?? 0;
  const readOnly = Boolean(version && (account.status !== 'authenticated' || !sync.canEdit(aggregate!.work.id, version)));
  const state = sync.snapshot();
  const requiresLogin = ['expired', 'replaced'].includes(account.status);
  const confirmed = Boolean(saved && version && !cloud?.operation && cloud?.syncedRevision === aggregate?.work.revision);
  const syncLabel = requiresLogin ? '请重新登录' : !aggregate ? '' : !saved ? '正在保存…'
    : confirmed ? '已保存到云端' : !cloud?.recoveryOf && state.status === 'syncing' ? '正在同步…' : '已保存到本机';
  const failure = account.error || (state.status === 'error' ? state.error : '');
  let cloudMessage = account.account && failure ? errorMessage(failure, '保存暂未完成，请重试。') : '';
  if (account.status === 'offline') cloudMessage = readOnly ? '网络已断开，编辑已暂停。请联网后重试。' : '';
  return { cloudVersion: version, readOnly, syncLabel,
    cloudMessage, requiresLogin, canReconnect: Boolean(account.account && !requiresLogin && (readOnly || cloudMessage) && state.status !== 'syncing') };
}
