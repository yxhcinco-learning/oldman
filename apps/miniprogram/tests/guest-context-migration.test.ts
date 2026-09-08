import { afterEach, describe, expect, it } from 'vitest';
import { MiniAccountClient, type AccountPlatform } from '../miniprogram/auth/account-client';
import { MiniCloudTransport } from '../miniprogram/network/cloud';
import { MiniCloudSync } from '../miniprogram/sync/controller';
import { MiniDraftWriter, MiniWorkRepository } from '../miniprogram/storage/repository';
import { emptyDraft, newSession, prepareDialogue, startInterview, type CloudMutation, type CloudWork } from '../miniprogram/domain/core';
import { MemoryFileSystem } from './memory-file-system';

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));

async function setup() {
  const accountRecord = { id: 'guest-migration-author', nickname: '迁移测试', avatarVersion: 0, hasAvatar: false, expiresAt: '2099-01-01T00:00:00.000Z' };
  const remote = new Map<string, CloudWork>();
  const mutations: CloudMutation[] = [];
  const platform: AccountPlatform = { login: async () => 'unused', request: async (path, _method, _token, data) => {
    if (path === '/api/mini/account/me') return { statusCode: 200, data: accountRecord };
    if (path.startsWith('/api/mini/works?')) {
      const entries = [...remote.values()].map(({ snapshot, ...entry }) => { void snapshot; return entry; });
      return { statusCode: 200, data: { entries, cursor: entries.length, hasMore: false } };
    }
    if (path === '/api/mini/works/mutations') {
      const operation = data as CloudMutation;
      mutations.push(operation);
      if (operation.kind !== 'create' || !operation.snapshot) throw new Error('Unexpected migration operation');
      const work = operation.snapshot.work;
      const entry = { id: work.id, title: work.title, updatedAt: work.updatedAt, deletedAt: work.deletedAt,
        version: 1, sequence: remote.size + 1, purged: false };
      remote.set(work.id, { ...entry, snapshot: operation.snapshot });
      return { statusCode: 200, data: { operationId: operation.operationId, entry } };
    }
    throw new Error('Unexpected request: ' + path);
  } };
  const account = new MiniAccountClient(platform, { read: async () => ({ version: 2, token: 'a'.repeat(43), account: accountRecord }), write: async () => {}, clear: async () => {} });
  await account.restore();
  const files = new MemoryFileSystem();
  const guest = new MiniWorkRepository(files, '/guest-context');
  const repository = new MiniWorkRepository(files, '/guest-context', undefined, accountRecord.id);
  const sync = new MiniCloudSync(repository, new MiniDraftWriter(repository), account,
    new MiniCloudTransport(account.bound(account.snapshot().generation, accountRecord.id), platform), account.snapshot().generation, guest);
  cleanup.push(() => sync.dispose());
  return { guest, repository, sync, files, remote, mutations };
}

describe('登录迁移中的未写作上下文', () => {
  it.each(['blank', 'interview'] as const)('新 %s 恢复上下文原样保留，其他既有文章仍可迁移且不新增空文章', async mode => {
    const s = await setup();
    const previous = { ...emptyDraft(), title: '原有文章', inputMode: 'text' as const, textDraft: '已有的真实正文。' };
    await s.guest.save(previous, 0);
    const draft = emptyDraft();
    const session = mode === 'interview' ? startInterview(newSession(draft), draft, 'open') : null;
    await s.guest.writeRecovery(draft, 0, session);
    const before = s.files.files.get(s.guest.paths.recovery);
    await s.sync.sync();
    await s.sync.sync();
    expect(s.sync.snapshot().status).toBe('ready');
    expect(s.mutations.map(operation => operation.workId)).toEqual([previous.id]);
    expect([...s.remote.keys()]).toEqual([previous.id]);
    expect((await s.repository.load()).works.map(work => work.id)).toEqual([previous.id]);
    expect(await s.repository.getAggregate(draft.id)).toBeNull();
    expect(await s.guest.getAggregate(draft.id)).toBeNull();
    expect(s.files.files.get(s.guest.paths.recovery)).toBe(before);
    expect((await s.guest.load(draft.id)).recovery?.draft.id).toBe(draft.id);
    if (mode === 'blank') expect(before).toBeUndefined();
    else expect((await new MiniWorkRepository(s.files, '/guest-context').load(draft.id)).recoverySession).toEqual(session);
  });

  it('真实标题恢复继续阻止迁移，不能遗漏其内容', async () => {
    const s = await setup();
    const draft = { ...emptyDraft(), title: '待恢复标题' };
    await s.guest.writeRecovery(draft, 0, newSession(draft));
    const before = await s.files.readText(s.guest.paths.recovery);
    await expect(s.sync.sync()).rejects.toThrow('待恢复的输入');
    expect(s.mutations).toEqual([]);
    expect(await s.files.readText(s.guest.paths.recovery)).toBe(before);
  });

  it.each(['voice', 'composer', 'message', 'request'] as const)('%s 中间状态不建稿或阻断迁移，已发送会话仍可按 ID 恢复', async kind => {
    const s = await setup();
    const draft = { ...emptyDraft(), ...(kind === 'voice' ? { pendingVoice: '待确认语音' } : {}) };
    let session = newSession(draft);
    if (kind === 'message') session = prepareDialogue(session, draft, 'message', '还没有保存的原话。', 'send');
    if (kind === 'request') session.turns.push({ id: 'request', createdAt: '2026-09-08T00:00:00.000Z', action: 'question',
      prompt: '', status: 'failed', inputVersionId: session.versions[0].id, error: '等待重试' });
    const state = { composer: kind === 'composer' ? '未发送文字' : '', inputSource: 'typed' as const };
    await s.guest.writeRecovery(draft, 0, session, state);
    const before = await s.files.readText(s.guest.paths.recovery);
    await s.sync.sync();
    expect(s.sync.snapshot().status).toBe('ready');
    expect(s.mutations).toEqual([]);
    expect((await s.repository.load()).works).toEqual([]);
    expect((await s.guest.load(draft.id)).recovery?.draft.pendingVoice).toBe(draft.pendingVoice);
    expect(await s.files.readText(s.guest.paths.recovery)).toBe(before);
    expect(before).not.toContain('待确认语音');
    expect(before).not.toContain('未发送文字');
    const reopened = await new MiniWorkRepository(s.files, '/guest-context').load(draft.id);
    expect(reopened.works).toEqual([]);
    expect(reopened.recoverySession).toEqual(session);
    expect(reopened.recovery?.draft.pendingVoice).toBe('');
    expect(reopened.recoveryWritingState).toBeUndefined();
    expect(state.composer).toBe(kind === 'composer' ? '未发送文字' : '');
  });

  it('既有文章清空后的恢复记录仍阻止迁移旧正文', async () => {
    const s = await setup();
    const original = { ...emptyDraft(), title: '已有文章', inputMode: 'text' as const, textDraft: '不应迁移的旧正文。' };
    const work = (await s.guest.save(original, 0))!;
    const current = { ...emptyDraft(), id: original.id };
    await s.guest.writeRecovery(current, work.revision, newSession(current));
    const before = await s.files.readText(s.guest.paths.recovery);
    await expect(s.sync.sync()).rejects.toThrow('待恢复的输入');
    expect(s.mutations).toEqual([]);
    expect(await s.files.readText(s.guest.paths.recovery)).toBe(before);
    expect((await s.guest.getAggregate(work.id))?.work.draft.textDraft).toBe(original.textDraft);
  });

  it('独立待保存的会话结果不创建或上传文章，迁移后恢复文件仍保留完整回复', async () => {
    const s = await setup();
    const draft = emptyDraft();
    await s.guest.writeRecovery(draft, 0, startInterview(newSession(draft), draft, 'open'));
    const session = newSession(draft);
    session.turns.push({ id: 'reply', createdAt: '2026-09-08T00:00:00.000Z', action: 'question', prompt: '从哪里讲起？',
      status: 'answered', inputVersionId: session.versions[0].id, result: { answer: '可以从最难忘的一天讲起。', citedVersionIds: [] } });
    await s.guest.stageSession(draft, session, 0);
    const resultPath = `${s.guest.paths.root}/${draft.id}.result.json`;
    const before = await s.files.readText(resultPath);
    await s.sync.sync();
    expect(s.sync.snapshot().status).toBe('ready');
    expect(s.mutations).toEqual([]);
    expect((await s.repository.load()).works).toEqual([]);
    expect(await s.files.readText(resultPath)).toBe(before);
    const reopened = await new MiniWorkRepository(s.files, '/guest-context').load(draft.id);
    expect(reopened.works).toEqual([]);
    expect(reopened.pendingSessions).toHaveLength(1);
    expect(reopened.pendingSessions[0].session).toEqual(session);
  });
});
