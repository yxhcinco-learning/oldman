import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniWorkRepository, MiniDraftWriter } from '../miniprogram/storage/repository';
import { MemoryFileSystem } from './memory-file-system';
import { emptyDraft } from '../miniprogram/domain/core';
import type { miniServices } from '../miniprogram/services';

const current = vi.hoisted(() => ({ services: {} as ReturnType<typeof miniServices> }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => current.services }));
import { openLogin, finishLogin, resolveLoginReturn, clearLoginReturn, cancelLogin } from '../miniprogram/auth/navigation';

const asServices = (repository: MiniWorkRepository) => ({ repository }) as ReturnType<typeof miniServices>;
afterEach(() => { clearLoginReturn(); vi.unstubAllGlobals(); });

describe('登录后回到固定归属的原作品', () => {
  it('游客作品 ID 碰撞后使用持久认领标识，完整输入仍在', async () => {
    const files = new MemoryFileSystem();
    const guest = new MiniWorkRepository(files, '/data');
    const account = new MiniWorkRepository(files, '/data', undefined, 'account-a');
    const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '登录前的原文' };
    const writer = new MiniDraftWriter(guest);
    writer.setWritingState(draft.id, { composer: '还没有发送', inputSource: 'typed' });
    await writer.write(draft);
    const claimed = await guest.claim(draft.id, 'account-a', 'new-cloud-id');
    await account.addClaimed(claimed, 'new-cloud-id');
    await guest.claim(draft.id, 'account-a', 'new-cloud-id', true);
    const target = { url: '/pages/editor/index?id=' + draft.id + '&xiaowen=compose', workId: draft.id, source: asServices(guest) };
    expect(await resolveLoginReturn(target, asServices(account))).toBe('/pages/editor/index?id=new-cloud-id&xiaowen=compose');
    expect((await account.getAggregate('new-cloud-id'))?.writingState?.composer).toBe('还没有发送');
  });
  it('不同账号不得读取原账号作品；未完成认领回到作品列表', async () => {
    const files = new MemoryFileSystem();
    const a = new MiniWorkRepository(files, '/data', undefined, 'account-a');
    const b = new MiniWorkRepository(files, '/data', undefined, 'account-b');
    const read = vi.spyOn(a, 'getAggregate');
    expect(await resolveLoginReturn({ url: '/pages/editor/index?id=private', workId: 'private', source: asServices(a) }, asServices(b))).toBe('/pages/works/index');
    expect(read).not.toHaveBeenCalled();
    const guest = new MiniWorkRepository(files, '/data');
    const draft = { ...emptyDraft(), title: '认领中' };
    await new MiniDraftWriter(guest).write(draft);
    await guest.claim(draft.id, 'account-a', 'new-id');
    expect(await resolveLoginReturn({ url: '/pages/editor/index?id=' + draft.id, workId: draft.id, source: asServices(guest) }, asServices(a))).toBe('/pages/works/index');
  });
  it('用户离开后迟到结果不导航，取消后不留下旧返回目的地', async () => {
    const navigateTo = vi.fn().mockResolvedValue({}), reLaunch = vi.fn().mockResolvedValue({});
    vi.stubGlobal('wx', { navigateTo, reLaunch });
    await openLogin({ url: '/pages/profile/index' });
    await finishLogin(() => false);
    expect(reLaunch).not.toHaveBeenCalled();
    clearLoginReturn();
    await finishLogin(() => true);
    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/home/index' });
  });
  it('取消明确重开原作品；账号已变时回到作品列表，不暴露原缓存', async () => {
    const navigateTo = vi.fn().mockResolvedValue({}), reLaunch = vi.fn().mockResolvedValue({});
    vi.stubGlobal('wx', { navigateTo, reLaunch });
    await openLogin({ url: '/pages/editor/index?id=kept', workId: 'kept', source: current.services });
    await cancelLogin();
    expect(reLaunch).toHaveBeenLastCalledWith({ url: '/pages/editor/index?id=kept' });
    await openLogin({ url: '/pages/editor/index?id=kept', workId: 'kept', source: current.services });
    current.services = {} as ReturnType<typeof miniServices>;
    await cancelLogin();
    expect(reLaunch).toHaveBeenLastCalledWith({ url: '/pages/works/index' });
  });
});
