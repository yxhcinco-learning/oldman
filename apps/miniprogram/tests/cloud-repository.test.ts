import { describe, expect, it } from 'vitest';
import { emptyDraft, workFromDraft, emptyWritingState, type CloudWork } from '../miniprogram/domain/core';
import { MiniWorkRepository } from '../miniprogram/storage/repository';
import { MemoryFileSystem } from './memory-file-system';

describe('账号仓储与恢复', () => {
  it('认领意图持久化、游客隐藏已归属文章、其他账号不能再认领', async () => {
    const files = new MemoryFileSystem();
    const guest = new MiniWorkRepository(files, '/device');
    const draft = { ...emptyDraft(), title: '旧作品' };
    await guest.save(draft, 0);
    const claimed = await guest.claim(draft.id, 'account-a', draft.id);
    const restarted = new MiniWorkRepository(files, '/device');
    expect((await restarted.load()).works).toEqual([]);
    await expect(restarted.claim(draft.id, 'account-b', draft.id)).rejects.toMatchObject({ category: 'conflict' });
    const account = new MiniWorkRepository(files, '/device', undefined, 'account-a');
    await account.addClaimed(claimed, draft.id); await account.addClaimed(claimed, draft.id);
    expect((await account.load()).works).toHaveLength(1);
    expect((await new MiniWorkRepository(files, '/device', undefined, 'account-b').load()).works).toEqual([]);
  });

  it('保留恢复稿失败时不覆盖本机原文，重试不重复生成恢复稿', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/device', undefined, 'account-a');
    const draft = { ...emptyDraft(), title: '本机旧稿', textDraft: '未上传', inputMode: 'text' as const };
    await repository.save(draft, 0);
    const remoteWork = workFromDraft({ ...draft, textDraft: '云端新版' });
    const remote: CloudWork = { id: draft.id, version: 2, sequence: 2, title: remoteWork.title, updatedAt: remoteWork.updatedAt, deletedAt: null, purged: false,
      snapshot: { work: remoteWork, session: null, writingState: emptyWritingState() } };
    files.failOnce('writeText', new Error('quota exceeded'), path => path.includes('.work.json.tmp'));
    await expect(repository.installRemote(remote)).rejects.toBeDefined();
    expect((await repository.getAggregate(draft.id))!.work.draft.textDraft).toBe('未上传');
    await repository.installRemote(remote); await repository.installRemote(remote);
    const works = await repository.allAggregates();
    expect(works).toHaveLength(2);
    expect(works.find(item => item.cloud?.recoveryOf)?.work.draft.textDraft).toBe('未上传');
    expect(works.find(item => item.work.id === draft.id)?.work.draft.textDraft).toBe('云端新版');
  });
});
