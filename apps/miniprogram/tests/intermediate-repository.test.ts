import { describe, expect, it } from 'vitest';
import { emptyDraft, makeBackup, newSession, prepareDialogue, startInterview, workFromDraft, type Draft } from '../miniprogram/domain/core';
import { workFilePath } from '../miniprogram/storage/paths';
import { MiniWorkRepository } from '../miniprogram/storage/repository';
import { type WorkAggregate } from '../miniprogram/storage/schema';
import { MemoryFileSystem } from './memory-file-system';

const clock = () => new Date('2026-09-08T00:00:00.000Z');
const writing = (body: string): Draft => ({ ...emptyDraft(), inputMode: 'text', textDraft: body });

async function importLegacyInputs(repository: MiniWorkRepository) {
  const work = workFromDraft(writing('旧备份中的正文。'));
  const backup = JSON.parse(makeBackup([work]));
  backup.works[0].draft.pendingVoice = '旧版待确认语音';
  backup.works[0].draft.segmentEdit = { id: 'pending', text: '旧版编辑框文字' };
  backup.writingStates = [{ workId: work.id, state: { composer: '旧版未发送消息', inputSource: 'dictated' } }];
  await repository.importBackup(JSON.stringify(backup));
  return (await repository.load()).works[0];
}

describe('文章与中间输入分离的仓储边界', () => {
  it('正文恢复为已保存快照后清理旧恢复记录，重开不会复活撤回的修改', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/same-snapshot', clock);
    const draft = writing('正文 A');
    const saved = (await repository.save(draft, 0))!;
    await repository.writeRecovery({ ...draft, textDraft: '正文 B' }, saved.revision);

    const unchanged = await repository.save(draft, saved.revision);

    expect(unchanged?.revision).toBe(saved.revision);
    const reopened = await new MiniWorkRepository(files, '/same-snapshot', clock).load(draft.id);
    expect(reopened.recovery).toBeNull();
    expect(reopened.works[0].draft.textDraft).toBe('正文 A');
    expect(await files.exists(repository.paths.recovery)).toBe(false);
  });

  it.each(['save', 'writeRecovery'] as const)('%s 拒绝旧 revision 后仍保留最新输入框内存', async operation => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/rejected-input', clock);
    const draft = writing('最初正文');
    const original = (await repository.save(draft, 0))!;
    const latest = { ...draft, textDraft: '当前正文', pendingVoice: '最新待确认语音', segmentEdit: { id: 'pending', text: '最新编辑框' } };
    const saved = (await repository.save(latest, original.revision))!;
    const stale = { ...latest, pendingVoice: '旧页面语音', segmentEdit: { id: 'pending', text: '旧页面编辑框' } };

    await expect(repository[operation](stale, 0)).rejects.toMatchObject({ category: 'conflict' });

    const snapshot = await repository.load(draft.id);
    expect(snapshot.works[0]).toMatchObject({ revision: saved.revision, draft: {
      textDraft: latest.textDraft, pendingVoice: latest.pendingVoice, segmentEdit: latest.segmentEdit,
    } });
    expect(snapshot.recovery).toBeNull();
  });

  it.each(['save', 'writeRecovery'] as const)('%s 通过校验但文件写入失败时仍保留本次输入内存', async operation => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/failed-input', clock);
    const draft = emptyDraft(), session = startInterview(newSession(draft), draft, 'open');
    await repository.save(draft, 0, session);
    const current = { ...draft, pendingVoice: '这次尚未确认的语音' };
    files.failOnce('writeText', new Error('write unavailable'), path => path === `${repository.paths.root}/${draft.id}.context.json.tmp`);

    await expect(repository[operation](current, 0, session)).rejects.toThrow();

    expect((await repository.load(draft.id)).recovery?.draft.pendingVoice).toBe(current.pendingVoice);
    const reopened = await new MiniWorkRepository(files, '/failed-input', clock).load(draft.id);
    expect(reopened.works).toEqual([]);
    expect(reopened.recovery?.draft.pendingVoice).toBe('');
    expect(reopened.recoverySession).toEqual(session);
  });

  it('按 ID 会话已落盘而活动记录写入失败时，旧内存缓存不能遮挡新消息', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/context-cache', clock);
    const draft = emptyDraft(), session = startInterview(newSession(draft), draft, 'open');
    await repository.save(draft, 0, session);
    const next = prepareDialogue(session, draft, 'message', '已经发送的新消息', 'send');
    files.failOnce('writeText', new Error('active recovery unavailable'), path => path === `${repository.paths.recovery}.tmp`);

    await expect(repository.save(draft, 0, next)).rejects.toThrow();

    const live = await repository.load(draft.id);
    const reopened = await new MiniWorkRepository(files, '/context-cache', clock).load(draft.id);
    expect(live.recoverySession).toEqual(next);
    expect(reopened.recoverySession).toEqual(next);
    expect(live.works).toEqual([]);
    expect(await repository.save(draft, 0, next)).toBeNull();
    expect(JSON.parse(await files.readText(repository.paths.recovery)).session).toEqual(next);
  });

  it('更新输入或首次确认正文未传会话时，沿用同 ID 已发送的上下文', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/retained-session', clock);
    const draft = emptyDraft();
    const session = prepareDialogue(newSession(draft), draft, 'message', '先从小时候的事讲起。', 'send');
    await repository.save(draft, 0, session);

    const pending = { ...draft, pendingVoice: '待确认的口述' };
    expect(await repository.save(pending, 0)).toBeNull();
    const temporary = await repository.load(draft.id);
    expect(temporary.recoverySession).toEqual(session);
    expect(temporary.recovery?.draft.pendingVoice).toBe(pending.pendingVoice);

    const saved = await repository.save({ ...pending, inputMode: 'text', textDraft: '确认后的第一段。', pendingVoice: '' }, 0);
    expect(saved?.id).toBe(draft.id);
    const reopened = await new MiniWorkRepository(files, '/retained-session', clock).load(draft.id);
    expect(reopened.recovery).toBeNull();
    expect(reopened.works).toHaveLength(1);
    expect(reopened.works[0].draft.textDraft).toBe('确认后的第一段。');
    expect(reopened.sessions).toEqual([session]);
  });

  it('旧备份首次建立云操作时剥离输入框，实际正文继续进入快照', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/legacy-upload', clock);
    const imported = await importLegacyInputs(repository);

    const operation = await repository.queueMutation(imported.id);

    expect(operation?.kind).toBe('create');
    expect(operation?.snapshot?.work.draft).toMatchObject({ textDraft: '旧备份中的正文。', pendingVoice: '', segmentEdit: null });
    expect(operation?.snapshot?.writingState).toEqual({ composer: '', inputSource: 'typed' });
    expect(JSON.stringify(operation)).not.toContain('旧版');
  });

  it('旧版已冻结操作按原 ID 和原内容幂等重试，不能被新快照规则改写', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/frozen-upload', clock);
    const imported = await importLegacyInputs(repository);
    await repository.queueMutation(imported.id);
    const path = workFilePath(repository.paths, imported.id);
    const aggregate = JSON.parse(await files.readText(path)) as WorkAggregate;
    const frozen = aggregate.cloud!.operation!;
    frozen.snapshot!.work.draft.pendingVoice = '升级前冻结的语音';
    frozen.snapshot!.writingState = { composer: '升级前冻结的输入', inputSource: 'dictated' };
    files.set(path, JSON.stringify(aggregate));
    const before = await files.readText(path);

    const reopened = new MiniWorkRepository(files, '/frozen-upload', clock);
    expect(await reopened.queueMutation(imported.id)).toEqual(frozen);
    expect(await reopened.queueMutation(imported.id)).toEqual(frozen);
    expect(await files.readText(path)).toBe(before);
  });
});
