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
    expect(writingAccess(value, account, sync).syncLabel).toBe('已同步');
    expect(writingAccess({ ...value, work: { ...value.work, revision: 2 } }, account, sync).syncLabel).toBe('未上传');
    expect(writingAccess(value, account, sync, false).syncLabel).toBe('正在保存到本机');
  });
  it('接管或未校验时锁住云作品，本机新稿仍可编辑', () => {
    const paused = { ...sync, canEdit: () => false } as unknown as MiniCloudSync;
    expect(writingAccess(aggregate, { ...account, status: 'replaced' }, paused)).toMatchObject({ readOnly: true, syncLabel: '需重新登录' });
    expect(writingAccess({ ...aggregate, cloud: emptyCloudMetadata() }, { ...account, status: 'offline' }, paused).readOnly).toBe(false);
  });
});
