import type { AccountState } from '../auth/account-client';
import type { WorkAggregate } from '../storage/schema';
import type { MiniCloudSync } from './controller';

/** A cloud receipt confirms only its saved revision, never newer page input. */
export function writingAccess(aggregate: WorkAggregate | null, account: AccountState, sync: MiniCloudSync, saved = true) {
  const cloud = aggregate?.cloud;
  const version = cloud?.version ?? 0;
  const readOnly = Boolean(version && !sync.canEdit(aggregate!.work.id, version));
  const state = sync.snapshot();
  const requiresLogin = ['expired', 'replaced'].includes(account.status);
  const syncLabel = requiresLogin ? '需重新登录' : !account.account || cloud?.recoveryOf ? '本机已保存'
    : state.status === 'syncing' ? '正在同步'
      : saved && version && !cloud?.operation && cloud?.syncedRevision === aggregate?.work.revision ? '已同步' : '未上传';
  const cloudMessage = account.account ? account.error || state.error : '';
  return { cloudVersion: version, readOnly, syncLabel: saved ? syncLabel : '正在保存到本机',
    cloudMessage, requiresLogin, canReconnect: Boolean(account.account && !requiresLogin && (readOnly || cloudMessage) && state.status !== 'syncing') };
}
