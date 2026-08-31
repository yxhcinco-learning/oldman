import { describe, expect, it } from 'vitest';
import { completeVoice, emptyDraft, makeBackup, newSession, workFromDraft, type Draft } from '../miniprogram/domain/core';
import { MiniStorageError, storageError } from '../miniprogram/storage/errors';
import { MiniDraftWriter, MiniWorkRepository } from '../miniprogram/storage/repository';
import { repositoryPaths, workFilePath } from '../miniprogram/storage/paths';
import { MemoryFileSystem } from './memory-file-system';

const clock = () => new Date('2026-09-01T00:00:00.000Z');
const writing = (text: string, title = ''): Draft => completeVoice({ ...emptyDraft(), title, pendingVoice: text });

describe('小程序本地作品仓储', () => {
  it('接受微信用户文件根路径并拒绝越界路径', () => {
    expect(repositoryPaths('wxfile://usr/').root).toBe('wxfile://usr/suiyue-v1');
    expect(repositoryPaths('http://usr/').root).toBe('http://usr/suiyue-v1');
    expect(() => repositoryPaths('wxfile://usr/../other')).toThrow('根路径无效');
    expect(() => repositoryPaths('https://example.com/usr')).toThrow('根路径无效');
    expect(() => workFilePath(repositoryPaths('/user'), '../escape')).toThrow('不能用于本地文件路径');
  });

  it('识别微信文件 API 的结构化错误消息', () => {
    expect(storageError({ errMsg: 'writeFile:fail permission denied' }).category).toBe('permission');
    expect(storageError({ errMsg: 'writeFile:fail quota exceeded' }).category).toBe('capacity');
  });

  it('按作品聚合保存、恢复未完成输入并保持会话', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const draft = writing('桂花落在旧木桌上。', '院子');
    const session = newSession(draft);
    const saved = await repository.save(draft, 0, session);
    expect(saved?.revision).toBe(1);

    const pending = { ...draft, textDraft: '尚未保存的补充', inputMode: 'text' as const };
    await repository.writeRecovery(pending, 1, session);
    const reopened = await new MiniWorkRepository(files, '/user', clock).load();
    expect(reopened.works[0]?.draft.segments[0]?.text).toBe('桂花落在旧木桌上。');
    expect(reopened.sessions[0]?.workId).toBe(draft.id);
    expect(reopened.recovery?.draft.textDraft).toBe('尚未保存的补充');
    expect(reopened.recovery?.revision).toBe(1);
  });

  it('串行快速写入并拒绝旧 revision 覆盖', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const writer = new MiniDraftWriter(repository);
    const first = writing('第一段');
    writer.seed(first.id, 0);
    const second = { ...first, segments: [{ ...first.segments[0]!, text: '第二段' }] };
    await Promise.all([writer.write(first), writer.write(second)]);
    await writer.flush();
    expect((await repository.load()).works[0]?.segments[0]?.text).toBe('第二段');
    await expect(repository.save(first, 0)).rejects.toMatchObject({ category: 'conflict' });
  });

  it('从损坏索引重建，并隔离损坏聚合而不清空有效作品', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const valid = writing('仍然有效');
    await repository.save(valid, 0);
    files.set(repository.paths.index, '{broken');
    files.set(`${repository.paths.works}/broken.work.json`, '{broken');

    const snapshot = await new MiniWorkRepository(files, '/user', clock).load();
    expect(snapshot.works).toHaveLength(1);
    expect(snapshot.works[0]?.id).toBe(valid.id);
    expect(snapshot.issues.some(issue => issue.category === 'corrupt')).toBe(true);
    expect([...files.files.keys()].some(path => path.includes('/quarantine/broken.work.json.corrupt-'))).toBe(true);
    expect([...files.files.keys()].some(path => path.includes('/quarantine/index.json.corrupt-'))).toBe(true);
  });

  it('索引指向的用户文件丢失时说明原因且不创建空内容', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const draft = writing('会被系统清理的作品');
    await repository.save(draft, 0);
    files.files.delete(`${repository.paths.works}/${draft.id}.work.json`);

    const snapshot = await new MiniWorkRepository(files, '/user', clock).load();
    expect(snapshot.works).toEqual([]);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({ category: 'missing' }));
    expect([...files.files.values()].some(raw => raw.includes('会被系统清理的作品'))).toBe(false);
  });

  it('启动时从完整临时文件恢复中断的替换', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const draft = writing('替换前');
    await repository.save(draft, 0);
    const target = `${repository.paths.works}/${draft.id}.work.json`;
    const raw = files.files.get(target)!;
    files.files.delete(target);
    files.set(`${target}.tmp`, raw.replaceAll('替换前', '临时文件中的新内容'));
    files.set(target, '{broken');

    const snapshot = await new MiniWorkRepository(files, '/user', clock).load();
    expect(snapshot.works[0]?.segments[0]?.text).toBe('临时文件中的新内容');
  });

  it('写入容量失败时保留原聚合并给出确定错误类别', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const draft = writing('已保存版本');
    await repository.save(draft, 0);
    files.failOnce('writeText', new Error('quota exceeded'), path => path.endsWith('.work.json.tmp'));
    const changed = { ...draft, segments: [{ ...draft.segments[0]!, text: '内存中的新版本' }] };
    await expect(repository.save(changed, 1)).rejects.toMatchObject({ category: 'capacity' });
    expect((await repository.load()).works[0]?.segments[0]?.text).toBe('已保存版本');
  });

  it('系统替换失败时回滚原聚合，并在成功后清理临时文件', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const draft = writing('稳定版本');
    await repository.save(draft, 0);
    const target = `${repository.paths.works}/${draft.id}.work.json`;
    files.failOnce('rename', new Error('unexpected io failure'), path => path.endsWith('.work.json.tmp'));
    const changed = { ...draft, segments: [{ ...draft.segments[0]!, text: '不完整版本' }] };
    await expect(repository.save(changed, 1)).rejects.toMatchObject({ category: 'system' });
    expect((await repository.load()).works[0]?.segments[0]?.text).toBe('稳定版本');
    expect(files.files.has(`${target}.tmp`)).toBe(false);
    expect(files.files.has(`${target}.bak`)).toBe(false);

    await repository.save(changed, 1);
    expect(files.files.has(`${target}.tmp`)).toBe(false);
    expect(files.files.has(`${target}.bak`)).toBe(false);
  });

  it('软删除、恢复与明确永久删除保持单调 revision', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    const draft = writing('回收站作品');
    await repository.save(draft, 0);
    const deleted = await repository.setDeleted(draft.id, true, 1);
    expect(deleted.revision).toBe(2);
    const restored = await repository.setDeleted(draft.id, false, 2);
    expect(restored.revision).toBe(3);
    const deletedAgain = await repository.setDeleted(draft.id, true, 3);
    await repository.permanentlyDelete(draft.id, deletedAgain.revision);
    expect((await repository.load()).works).toEqual([]);
  });

  it('兼容备份导入为副本，失败时回滚本次已写聚合', async () => {
    const files = new MemoryFileSystem();
    const repository = new MiniWorkRepository(files, '/user', clock);
    await repository.load();
    const a = workFromDraft(writing('甲'));
    const b = workFromDraft(writing('乙'));
    expect(await repository.importBackup(makeBackup([a]))).toBe(1);
    const imported = await repository.load();
    expect(imported.works[0]?.id).not.toBe(a.id);
    expect(imported.works[0]?.title).toContain('副本');

    let aggregateWrites = 0;
    files.failOnce('writeText', new Error('permission denied'), path => path.endsWith('.work.json.tmp') && ++aggregateWrites === 2);
    await expect(repository.importBackup(makeBackup([a, b]))).rejects.toBeInstanceOf(MiniStorageError);
    expect((await repository.load()).works).toHaveLength(1);

    const legacy = JSON.parse(makeBackup([a])) as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.sessions;
    for (const item of legacy.works as Array<{ draft: Record<string, unknown> }>) {
      delete item.draft.topicSnapshot;
      delete item.draft.materials;
      delete item.draft.topicWritingMode;
    }
    expect(await repository.importBackup(JSON.stringify(legacy))).toBe(1);
  });
});
