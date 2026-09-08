import { afterEach, describe, expect, it } from 'vitest';
import { MiniAccountClient, type AccountPlatform } from '../miniprogram/auth/account-client';
import { MiniCloudTransport } from '../miniprogram/network/cloud';
import { MiniCloudSync } from '../miniprogram/sync/controller';
import { MiniWorkRepository, MiniDraftWriter } from '../miniprogram/storage/repository';
import { emptyDraft, workFromDraft, emptyWritingState, newSession, type CloudWork, type CloudMutation } from '../miniprogram/domain/core';
import { MemoryFileSystem } from './memory-file-system';

const dispose: Array<() => void> = [];
afterEach(() => { dispose.splice(0).forEach(task => task()); });
function remoteWork(id: string, sequence = 1, purged = false): CloudWork {
  const work = workFromDraft({ ...emptyDraft(), id, title: '隔离作品', inputMode: 'text', textDraft: '已保存正文' });
  return { id, sequence, version: 1, title: work.title, updatedAt: work.updatedAt, deletedAt: purged ? work.updatedAt : null, purged,
    snapshot: purged ? null : { work, session: null, writingState: emptyWritingState() } };
}
async function fixture(initial: CloudWork[]) {
  const remote = new Map(initial.map(work => [work.id, work]));
  const calls: string[] = [];
  const accountRecord = { id: 'isolated-author', nickname: '隔离作者', avatarVersion: 0, hasAvatar: false, expiresAt: '2099-01-01T00:00:00.000Z' };
  const platform: AccountPlatform = { login: async () => 'unused', request: async (path, method, _token, data) => {
    calls.push(method + ' ' + path);
    if (path === '/api/mini/account/me') return { statusCode: 200, data: accountRecord };
    if (path.startsWith('/api/mini/works?')) {
      const cursor = Number(path.split('=')[1]);
      const rows = [...remote.values()].filter(item => item.sequence > cursor).sort((a, b) => a.sequence - b.sequence);
      const page = rows.slice(0, 100), entries = page.map(({ snapshot, ...entry }) => { void snapshot; return entry; });
      return { statusCode: 200, data: { entries, cursor: page.at(-1)?.sequence ?? cursor, hasMore: rows.length > 100 } };
    }
    if (path === '/api/mini/works/mutations') {
      const operation = data as CloudMutation, current = remote.get(operation.workId)!;
      if (operation.baseVersion !== current.version) return { statusCode: 409, data: { code: 'version_conflict', error: '云作品已更新。' } };
      if (operation.kind !== 'purge') throw new Error('Unexpected test mutation');
      const next = { ...current, snapshot: null, purged: true, version: current.version + 1, sequence: current.sequence + 1 };
      remote.set(current.id, next); const { snapshot, ...entry } = next; void snapshot;
      return { statusCode: 200, data: { operationId: operation.operationId, entry } };
    }
    if (path.startsWith('/api/mini/works/')) return { statusCode: 200, data: structuredClone(remote.get(path.slice('/api/mini/works/'.length))) };
    throw new Error('Unexpected test request: ' + path);
  } };
  const account = new MiniAccountClient(platform, { read: async () => ({ version: 2, token: 'a'.repeat(43), account: accountRecord }), write: async () => {}, clear: async () => {} });
  await account.restore();
  const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/isolated', undefined, accountRecord.id);
  const sync = new MiniCloudSync(repository, new MiniDraftWriter(repository), account, new MiniCloudTransport(account.bound(account.snapshot().generation, accountRecord.id), platform), account.snapshot().generation);
  dispose.push(() => sync.dispose()); calls.length = 0;
  return { remote, calls, repository, files, sync, account, reads: () => calls.filter(path => path.startsWith('GET /api/mini/works/')) };
}

describe('永久删除目录不会重复逐篇读取', () => {
  it.each([20, 100, 101])('%i 条永久删除标记跨两轮同步仅查询分页目录', async count => {
    const f = await fixture(Array.from({ length: count }, (_, i) => remoteWork('purged-' + i, i + 1, true)));
    await f.sync.sync(); await f.sync.sync();
    expect(f.reads()).toEqual([]);
    expect(f.calls.filter(path => path.startsWith('GET /api/mini/works?'))).toHaveLength(Math.ceil(count / 100) * 2);
    expect(await f.repository.allAggregates()).toEqual([]);
  });

  it('正常缺失作品仍下载，后续无改动同步不再次下载', async () => {
    const f = await fixture([remoteWork('live'), remoteWork('purged', 2, true)]);
    await f.sync.sync(); await f.sync.sync();
    expect(f.reads()).toEqual(['GET /api/mini/works/live']);
    expect((await f.repository.getAggregate('live'))?.work.draft.textDraft).toBe('已保存正文');
  });

  it('没有聚合文件的未保存正文和小文回复原样保留', async () => {
    const f = await fixture([remoteWork('purged', 1, true)]);
    const draft = { ...emptyDraft(), id: 'purged', title: '尚未保存', textDraft: '必须保留的输入' };
    await f.repository.writeRecovery(draft, 0); await f.repository.stageSession(draft, newSession(draft), 0);
    const recovery = await f.files.readText(f.repository.paths.recovery), resultPath = f.repository.paths.root + '/purged.result.json';
    const result = await f.files.readText(resultPath);
    await f.sync.sync();
    expect(f.reads()).toEqual([]); expect(await f.files.readText(f.repository.paths.recovery)).toBe(recovery); expect(await f.files.readText(resultPath)).toBe(result);
    expect(await f.repository.getAggregate('purged')).toBeNull(); expect(f.sync.canEdit('purged', 1)).toBe(false);
  });

  it('本机仍有未同步改稿时继续核对删除并保留独立恢复稿', async () => {
    const live = remoteWork('live'); const f = await fixture([live]); await f.sync.sync();
    const local = (await f.repository.getAggregate('live'))!;
    await f.repository.save({ ...local.work.draft, textDraft: '尚未同步的本机正文' }, local.work.revision);
    f.remote.set('live', { ...live, version: 2, sequence: 2, deletedAt: live.updatedAt, purged: true, snapshot: null });
    f.calls.length = 0; await f.sync.sync();
    expect(f.reads()).toEqual(['GET /api/mini/works/live']); expect(await f.repository.getAggregate('live')).toBeNull();
    const recovery = (await f.repository.allAggregates()).find(item => item.cloud?.recoveryOf === 'live');
    expect(recovery?.work.draft.textDraft).toBe('尚未同步的本机正文'); expect(f.sync.canEdit('live', 1)).toBe(false);
    f.calls.length = 0; await f.sync.sync(); expect(f.reads()).toEqual([]); expect(await f.repository.allAggregates()).toHaveLength(1);
  });

  it('本机作品还有未落盘回复时维持冲突保护，不能删除原文或日志', async () => {
    const live = remoteWork('live'); const f = await fixture([live]); await f.sync.sync();
    const local = (await f.repository.getAggregate('live'))!; await f.repository.stageSession(local.work.draft, newSession(local.work.draft), local.work.revision);
    const path = f.repository.paths.root + '/live.result.json', before = await f.files.readText(path);
    f.remote.set('live', { ...live, version: 2, sequence: 2, deletedAt: live.updatedAt, purged: true, snapshot: null });
    await expect(f.sync.sync()).rejects.toThrow('小文回复');
    expect(await f.files.readText(path)).toBe(before); expect((await f.repository.getAggregate('live'))?.work.draft.textDraft).toBe('已保存正文');
    expect(f.sync.canEdit('live', 1)).toBe(false);
  });

  it('永久删除确认后立即收回编辑资格，不等待下一轮同步', async () => {
    const live = remoteWork('trashed'); live.deletedAt = live.updatedAt; live.snapshot!.work.deletedAt = live.updatedAt;
    const f = await fixture([live]); await f.sync.sync(); const local = (await f.repository.getAggregate('trashed'))!;
    expect(f.sync.canEdit('trashed', 1)).toBe(true);
    await f.sync.lifecycle('trashed', 'purge', local.work.revision);
    expect(f.sync.canEdit('trashed', 1)).toBe(false); expect(await f.repository.getAggregate('trashed')).toBeNull();
    f.calls.length = 0; await f.sync.sync(); expect(f.reads()).toEqual([]);
  });

  it('重放旧删除操作遇到已永久删除的冲突时同样收回编辑资格', async () => {
    const live = remoteWork('conflicting'); live.deletedAt = live.updatedAt; live.snapshot!.work.deletedAt = live.updatedAt;
    const f = await fixture([live]); await f.sync.sync(); const local = (await f.repository.getAggregate(live.id))!;
    await f.repository.queueMutation(live.id, 'purge');
    f.remote.set(live.id, { ...live, version: 2, sequence: 2, purged: true, snapshot: null });
    await expect(f.sync.lifecycle(live.id, 'purge', local.work.revision)).rejects.toThrow('云作品已更新');
    expect(await f.repository.getAggregate(live.id)).toBeNull(); expect(f.sync.canEdit(live.id, 1)).toBe(false);
    f.calls.length = 0; await f.sync.sync(); expect(f.reads()).toEqual([]);
  });
});
