import { describe, expect, it } from 'vitest';
import { writingAccess } from '../miniprogram/sync/writing-access';
import { emptyDraft, workFromDraft } from '../miniprogram/domain/core';
import { emptyCloudMetadata, LOCAL_SCHEMA_VERSION, type WorkAggregate } from '../miniprogram/storage/schema';
import type { MiniCloudSync } from '../miniprogram/sync/controller';
import type { AccountState } from '../miniprogram/auth/account-client';

describe('云作品编辑与真实确认状态', () => {
  const account = { status: 'authenticated', account: { id: 'author' }, generation: 1, error: '' } as AccountState;
  const aggregate: WorkAggregate = { app: 'suiyue-yousheng', savedAt: new Date().toISOString(), schemaVersion: LOCAL_SCHEMA_VERSION, work: workFromDraft(emptyDraft()), session: null,
    cloud: { ...emptyCloudMetadata(), version: 2, syncedRevision: 1 } };
  const sync = { canEdit: () => true, snapshot: () => ({ status: 'ready', error: '' }) } as unknown as MiniCloudSync;
  it('只将云确认覆盖的本机版本标为已同步', () => {
    const value = { ...aggregate, work: { ...aggregate.work, revision: 1 } };
    expect(writingAccess(value, account, sync).syncLabel).toBe('已保存到云端');
    expect(writingAccess({ ...value, work: { ...value.work, revision: 2 } }, account, sync).syncLabel).toBe('已保存到本机');
    expect(writingAccess(value, account, sync, false).syncLabel).toBe('正在保存…');
  });
  it('空白稿无标签，已确认作品不受其他同步活动影响', () => {
    expect(writingAccess(null, account, sync).syncLabel).toBe('');
    const syncing = { ...sync, snapshot: () => ({ status: 'syncing', error: '' }) } as unknown as MiniCloudSync;
    expect(writingAccess(null, account, syncing).syncLabel).toBe('');
    expect(writingAccess({ ...aggregate, work: { ...aggregate.work, revision: 1 } }, account, syncing).syncLabel).toBe('已保存到云端');
    expect(writingAccess({ ...aggregate, cloud: emptyCloudMetadata() }, account, syncing).syncLabel).toBe('正在同步…');
  });
  it('接管或未校验时锁住云作品，本机新稿仍可编辑', () => {
    const paused = { ...sync, canEdit: () => false } as unknown as MiniCloudSync;
    expect(writingAccess(aggregate, { ...account, status: 'replaced' }, paused)).toMatchObject({ readOnly: true, syncLabel: '请重新登录' });
    expect(writingAccess({ ...aggregate, cloud: emptyCloudMetadata() }, { ...account, status: 'offline' }, paused).readOnly).toBe(false);
  });
  it('游客不展示无关账号错误与重连，接管与网络错误提供不同操作', () => {
    expect(writingAccess(null, { status: 'guest', account: null, error: '上次登录失败', generation: 0 }, sync))
      .toMatchObject({ cloudMessage: '', canReconnect: false, requiresLogin: false });
    expect(writingAccess(aggregate, { ...account, status: 'replaced', error: '已在其他设备登录' }, sync))
      .toMatchObject({ canReconnect: false, requiresLogin: true });
    expect(writingAccess(aggregate, { ...account, status: 'offline', error: '网络不可用' }, sync))
      .toMatchObject({ canReconnect: true, requiresLogin: false });
  });
});
