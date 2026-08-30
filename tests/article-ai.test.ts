import { afterEach, expect, it, vi } from 'vitest';
import { emptyDraft } from '../lib/domain/writing';
import { documentOf, newSession, newVersion, type AiTurn } from '../lib/domain/article-ai';
import { IndexedWorkRepository } from '../lib/storage/repository';
import { makeBackup, parseBackupBundle } from '../lib/storage/backup';
import { Workspace } from '../features/writing/workspace';
import { ArticleAiController, requestArticleAi, type AiTransport } from '../features/ai/session';
import { buildAiRequest, MAX_CONTEXT_CHARS, type AiResponse } from '../features/ai/protocol';

const repos: IndexedWorkRepository[] = [];
const workspaces: Workspace[] = [];
afterEach(async () => { for (const workspace of workspaces.splice(0)) workspace.dispose(); for (const repo of repos.splice(0)) await repo.close(); });
const transport: AiTransport = async request => ({ requestId: request.requestId, result: request.action === 'question'
  ? { answer: '见原文。', citedVersionIds: [request.current.id] }
  : { answer: '整理了标点。', body: request.current.body + '。', citedVersionIds: [] } });
async function setup(text = '第一段\n\n第二段') {
  const repo = new IndexedWorkRepository(crypto.randomUUID()); repos.push(repo);
  const workspace = new Workspace(repo); workspaces.push(workspace); await workspace.initialize();
  await workspace.update({ ...emptyDraft(), inputMode: 'text', title: '测试文章', textDraft: text });
  const controller = new ArticleAiController(workspace, transport);
  return { workspace, controller, repo };
}
it('carries adopted, discarded and manual versions across successive operations', async () => {
  const { workspace, controller, repo } = await setup();
  const regular = await controller.run('regular'); expect(workspace.state.draft?.textDraft).toBe('第一段\n\n第二段');
  expect(await workspace.applyTurn(regular!)).toBe(true);
  await workspace.update({ ...workspace.state.draft!, textDraft: '用户自己改过的段落' });
  const polish = await controller.run('polish');
  const turn = workspace.getSession()!.turns.find(t => t.id === polish)!;
  expect(workspace.getSession()!.versions.find(v => v.id === turn.inputVersionId)?.body).toBe('用户自己改过的段落');
  await workspace.updateSession(workspace.state.draft!.id, session => ({ ...session, turns: session.turns.map(t => t.id === polish ? { ...t, status: 'dismissed' } : t) }));
  await controller.run('question', '刚才的第二段呢？');
  const request = buildAiRequest(workspace.getSession()!, 'question', '第二段', 'new');
  expect(request.turns.map(t => t.status)).toContain('applied'); expect(request.turns.map(t => t.status)).toContain('dismissed');
  expect(request.versions.some(v => v.body.includes('第二段'))).toBe(true);
  expect((await repo.load()).works[0].draft.textDraft).toBe('用户自己改过的段落');
});
it('keeps a conversational rewrite request and applies it as a distinct restorable version', async () => {
  const { workspace, repo } = await setup('第一段\n\n第二段');
  const call = vi.fn<AiTransport>(async request => ({ requestId: request.requestId, result: {
    answer: '只调整了第二段。', body: '第一段\n\n更温暖的第二段', citedVersionIds: [],
  } }));
  const controller = new ArticleAiController(workspace, call);
  const id = await controller.run('rewrite', '让第二段更温暖，第一段保持不变');
  expect(call).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][0]).toMatchObject({ action: 'rewrite', prompt: '让第二段更温暖，第一段保持不变' });
  expect(workspace.getSession()!.turns.find(turn => turn.id === id)).toMatchObject({
    action: 'rewrite', prompt: '让第二段更温暖，第一段保持不变', status: 'ready',
  });
  expect((await repo.load()).works[0].draft.textDraft).toBe('第一段\n\n第二段');
  expect(await workspace.applyTurn(id!)).toBe(true);
  expect(workspace.getSession()!.versions.at(-1)).toMatchObject({ source: 'rewrite', body: '第一段\n\n更温暖的第二段' });
  const restored = parseBackupBundle(makeBackup(workspace.state.works, workspace.state.draft, workspace.state.sessions));
  expect(restored.sessions[0].turns[0].prompt).toBe('让第二段更温暖，第一段保持不变');
});
it('refuses stale candidates and restore confirmations without overwriting later typing', async () => {
  const { workspace, controller, repo } = await setup(); const turn = await controller.run('rewrite', '只调整第二段');
  const baseline = workspace.getSession()!.versions[0];
  await workspace.update({ ...workspace.state.draft!, textDraft: '刚刚输入的新内容' });
  expect(await workspace.applyTurn(turn!)).toBe(false);
  expect(await workspace.restoreVersion(baseline.id, baseline)).toBe(false);
  expect((await repo.load()).works[0].draft.textDraft).toBe('刚刚输入的新内容');
});
it('keeps the original draft and candidate when applying fails to persist', async () => {
  const { workspace, controller, repo } = await setup(); const id = await controller.run('regular');
  const original = workspace.state.draft!.textDraft;
  vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('空间不足'));
  expect(await workspace.applyTurn(id!)).toBe(false);
  expect(workspace.state.draft!.textDraft).toBe(original); expect((await repo.load()).works[0].draft.textDraft).toBe(original);
  const backup = parseBackupBundle(makeBackup(workspace.state.works, workspace.state.draft, workspace.state.sessions));
  expect(backup.sessions[0].turns[0].status).toBe('ready');
  expect(await workspace.applyTurn(id!)).toBe(true);
});
it('rejects application after another tab saved a different revision', async () => {
  const { workspace, controller, repo } = await setup(); const id = await controller.run('regular');
  const work = (await repo.load()).works[0]; await repo.save({ ...work.draft, textDraft: '另一标签页的新正文' }, work.revision);
  expect(await workspace.applyTurn(id!)).toBe(false);
  expect((await repo.load()).works[0].draft.textDraft).toBe('另一标签页的新正文');
  expect(workspace.getSession()!.turns[0].status).toBe('ready');
});
it('cancels in-flight requests and ignores late output even if a transport ignores abort', async () => {
  const { workspace, repo } = await setup(); let release!: (value: AiResponse) => void;
  const slow = vi.fn<AiTransport>(() => new Promise(resolve => { release = resolve; }));
  const controller = new ArticleAiController(workspace, slow); const pending = controller.run('rewrite', '把第一段写得更温暖');
  await vi.waitFor(() => expect(slow).toHaveBeenCalledOnce()); const request = slow.mock.calls[0][0];
  await controller.cancel(); expect(slow.mock.calls[0][1].aborted).toBe(true);
  release({ requestId: request.requestId, result: { answer: '迟到结果', body: '不应写入', citedVersionIds: [] } }); await pending;
  expect(workspace.getSession()!.turns[0]).toMatchObject({ status: 'cancelled', action: 'rewrite', prompt: '把第一段写得更温暖' });
  expect(workspace.getSession()!.turns[0].result).toBeUndefined();
  expect((await repo.load()).works[0].draft.textDraft).toBe('第一段\n\n第二段');
});
it('blocks empty, excessive, unconfirmed or unsaved input before any network request', async () => {
  const { workspace, repo } = await setup(); const call = vi.fn(transport); const controller = new ArticleAiController(workspace, call);
  for (const patch of [{ textDraft: ' ' }, { textDraft: '字'.repeat(12001) }, { textDraft: '正文', pendingVoice: '未确认' }, { pendingVoice: '', segmentEdit: { id: 'pending', text: '编辑中' } }]) {
    await workspace.update({ ...workspace.state.draft!, ...patch }); expect(await controller.run('regular')).toBeNull();
  }
  await workspace.update({ ...workspace.state.draft!, segmentEdit: null });
  vi.spyOn(repo, 'save').mockRejectedValue(new Error('保存失败'));
  await workspace.update({ ...workspace.state.draft!, textDraft: '未保存' }); expect(await controller.run('regular')).toBeNull();
  expect(call).not.toHaveBeenCalled();
});
it('requires an explicit prompt for conversational rewrite before calling the service', async () => {
  const { workspace } = await setup(); const call = vi.fn(transport); const controller = new ArticleAiController(workspace, call);
  expect(await controller.run('rewrite', '   ')).toBeNull(); expect(call).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error).toContain('问题或调整要求');
});
it('keeps each work isolated and recovers interrupted turns without calling the service', async () => {
  const { workspace, repo } = await setup('第一篇独有内容');
  const session = workspace.getSession()!;
  const turn: AiTurn = { id: 'interrupted', action: 'regular', createdAt: new Date().toISOString(), prompt: '常规优化', inputVersionId: session.versions[0].id, status: 'running' };
  await workspace.updateSession(session.workId, current => ({ ...current, turns: [turn] }));
  const next = new Workspace(repo); workspaces.push(next); await next.initialize(); expect(next.getSession()!.turns[0].status).toBe('cancelled');
  await next.finish(); await next.newWork(); await next.update({ ...next.state.draft!, inputMode: 'text', textDraft: '第二篇' }); await next.checkpoint();
  const request = buildAiRequest(next.getSession()!, 'regular', '', 'second');
  expect(JSON.stringify(request)).not.toContain('第一篇独有内容'); expect(request.turns).toEqual([]);
});
it('selects relevant older versions within a bounded context without deleting local history', () => {
  const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '当前正文' }; const session = newSession(draft);
  for (let i = 0; i < 55; i++) session.versions.push(newVersion({ ...draft, textDraft: i === 1 ? '老槐树下的童年回忆' : `第${i}篇` + '普通内容'.repeat(1500) }, 'manual'));
  session.versions.push(newVersion(draft, 'manual'));
  const request = buildAiRequest(session, 'question', '老槐树下的童年回忆去哪了', 'query');
  expect(request.versions.some(v => v.body === '老槐树下的童年回忆')).toBe(true);
  expect(request.omittedRecords).toBeGreaterThan(0); expect(JSON.stringify(request).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  expect(session.versions).toHaveLength(57); expect(request.current.body).toBe('当前正文');
});
it('records typing checkpoints and creates a new restore version rather than deleting history', async () => {
  const { workspace } = await setup(); const unsubscribe = workspace.subscribe(() => {});
  const before = workspace.getSession()!.versions[0];
  await workspace.update({ ...workspace.state.draft!, textDraft: '新的修改' });
  await vi.waitFor(() => expect(workspace.getSession()!.versions.at(-1)?.body).toBe('新的修改'), { timeout: 2500 });
  const count = workspace.getSession()!.versions.length;
  expect(await workspace.restoreVersion(before.id, documentOf(workspace.state.draft!))).toBe(true);
  expect(workspace.getSession()!.versions).toHaveLength(count + 1); unsubscribe();
});
it('localizes network and non-JSON errors without exposing native exceptions', async () => {
  const { workspace } = await setup();
  const request = buildAiRequest(workspace.getSession()!, 'regular', '', 'network-error');
  const call = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(requestArticleAi(request, new AbortController().signal)).rejects.toThrow('无法连接本地 AI 服务');
  call.mockResolvedValueOnce(new Response('<html>proxy unavailable</html>', { status: 502 }));
  await expect(requestArticleAi(request, new AbortController().signal)).rejects.toThrow('未返回有效结果');
});
