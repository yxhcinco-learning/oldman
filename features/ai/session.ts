import { newId } from '../../lib/domain/writing';
import { ACTION_LABELS, documentOf, sameDocument, type AiAction, type AiTurn } from '../../lib/domain/article-ai';
import { Workspace } from '../writing/workspace';
import { prepareDialogue, settleDialogue, startInterview } from '../../packages/core/src/conversation';
import { newSession, type DialogueCommand } from '../../lib/domain/article-ai';
import { aiResponseSchema, buildAiRequest, MAX_ARTICLE_CHARS, type AiRequest, type AiResponse } from './protocol';

export type AiTransport = (request: AiRequest, signal: AbortSignal) => Promise<AiResponse>;
export const requestArticleAi: AiTransport = async (request, signal) => {
  let response: Response;
  try { response = await fetch('/api/ai/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal }); }
  catch { throw new Error(signal.aborted ? 'AI 请求已取消，原文未改变。' : '无法连接本地 AI 服务，请检查网络和本地服务后重试。'); }
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('本地 AI 服务未返回有效结果，请稍后重试。'); }
  const failure = data as { error?: unknown } | null;
  if (!response.ok) throw new Error(typeof failure?.error === 'string' ? failure.error.slice(0, 1000) : '文章 AI 暂时无法连接，请稍后重试。');
  const parsed = aiResponseSchema.safeParse(data);
  if (!parsed.success || parsed.data.requestId !== request.requestId) throw new Error('AI 返回结果无法核对，原文未改变。');
  return parsed.data;
};

export class ArticleAiController {
  private active?: { id: string; workId: string; controller: AbortController };
  private listeners = new Set<() => void>();
  private state = { busy: false, error: '' };
  constructor(private workspace: Workspace, private transport: AiTransport = requestArticleAi) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(next: Partial<typeof this.state>) { this.state = { ...this.state, ...next }; this.listeners.forEach(fn => fn()); }
  async startInterview() {
    const draft = this.workspace.state.draft;
    if (!draft || this.active || this.state.busy) return false;
    this.patch({ busy: true, error: '' });
    try { return await this.workspace.updateSession(draft.id, session => startInterview(session, draft, newId())); }
    finally { this.patch({ busy: false }); }
  }
  async run(action: AiAction, prompt = '', turnPrompt?: string, command: DialogueCommand = 'send', retryId?: string): Promise<string | null> {
    if (this.active || this.state.busy) return null;
    const draft = this.workspace.state.draft;
    if (!draft) { this.patch({ error: '请先打开一篇作品。' }); return null; }
    const body = documentOf(draft).body;
    const selectedMaterials = draft.materials.filter(material => material.selected);
    if (!['interview', 'compose', 'dialogue'].includes(action) && !body.trim()) { this.patch({ error: '先写下一句，再请小文帮忙。' }); return null; }
    if (action === 'interview' && !body.trim() && !draft.topicSnapshot && !draft.materials.length) { this.patch({ error: '先选一个话题，或在文章里写下一点内容。' }); return null; }
    if (action === 'compose' && !selectedMaterials.length) { this.patch({ error: '还没有可以整理的回答。' }); return null; }
    if (draft.pendingVoice.trim() || draft.segmentEdit) { this.patch({ error: '请先取消或完成待确认语音，再使用小文。' }); return null; }
    if (body.length > MAX_ARTICLE_CHARS) { this.patch({ error: '每篇最多 12000 字，请先分篇整理。原文不会被截断。' }); return null; }
    if (prompt.length > (action === 'dialogue' ? 12000 : 2000) || ['question', 'rewrite', 'chat', 'dialogue'].includes(action) && !prompt.trim()) { this.patch({ error: '请输入长度范围内的问题或调整要求。' }); return null; }
    if (retryId && !this.workspace.getSession()?.turns.some(turn => turn.id === retryId && ['failed', 'cancelled'].includes(turn.status))) return null;
    const active = { id: retryId ?? newId(), workId: draft.id, controller: new AbortController() };
    this.active = active; this.patch({ busy: true, error: '' });
    const timer = setTimeout(() => active.controller.abort(), 125000);
    try {
      if (!await this.workspace.checkpoint()) throw new Error('请先重试保存或导出备份，暂未发送 AI 请求。');
      if (this.active !== active || this.workspace.state.draft?.id !== active.workId) return null;
      let session = this.workspace.getSession(active.workId) ?? newSession(draft);
      const latest = this.workspace.state.draft;
      if (!latest || latest.pendingVoice.trim() || latest.segmentEdit || !sameDocument(session.versions.at(-1)!, documentOf(latest))) throw new Error('正文正在变化，请完成输入后再试。');
      if (action === 'dialogue') session = prepareDialogue(session, latest, active.id, prompt, command);
      const request = buildAiRequest(session, action, prompt.trim(), active.id, { topicSnapshot: latest.topicSnapshot, materials: latest.materials, command });
      const turn: AiTurn = { id: active.id, action, ...(action === 'dialogue' ? { command } : {}), prompt: turnPrompt?.trim() || (['question', 'rewrite', 'chat', 'interview', 'compose', 'dialogue'].includes(action) ? prompt.trim() : ACTION_LABELS[action]),
        inputVersionId: request.current.id, createdAt: new Date().toISOString(), status: 'running', omittedRecords: request.omittedRecords };
      if (!await this.workspace.updateSession(active.workId, current => ({ ...current, versions: session.versions, ...(action === 'dialogue' ? { conversation: session.conversation } : {}), turns: [...current.turns.filter(item => item.id !== active.id), turn] }))) throw new Error('会话尚未保存，暂未发送 AI 请求。');
      if (this.active !== active) return null;
      if (active.controller.signal.aborted) throw new Error('请求已超时。');
      const response = aiResponseSchema.parse(await this.transport(request, active.controller.signal));
      if (this.active !== active) return null;
      if (active.controller.signal.aborted) throw new Error('请求已超时。');
      if (response.requestId !== active.id || ['regular', 'polish', 'rewrite'].includes(action) && !response.result.body?.trim()) throw new Error('AI 返回结果无法核对，原文未改变。');
      const ids = new Set([request.current.id, ...request.versions.map(v => v.id)]);
      if (response.result.citedVersionIds.some(id => !ids.has(id))) throw new Error('AI 引用的历史无法核对，请重新提问。');
      if (['question', 'interview'].includes(action)) delete response.result.body;
      const saved = await this.workspace.updateSession(active.workId, current => action === 'dialogue' ? settleDialogue(current, active.id, response.result) : ({ ...current, turns: current.turns.map(t => t.id === active.id && t.status === 'running'
        ? { ...t, result: response.result, status: response.result.body ? 'ready' : 'answered' } : t) }));
      if (!saved) this.patch({ error: 'AI 结果已收到，但未保存到本机，请重试保存或导出备份。' });
      return active.id;
    } catch (error) {
      if (this.active !== active) return null;
      const message = active.controller.signal.aborted ? 'AI 请求已超时或取消，原文未改变。'
        : error instanceof Error && error.name !== 'ZodError' ? error.message : 'AI 连接或数据格式异常，原文未改变。';
      this.patch({ error: message });
      await this.workspace.updateSession(active.workId, current => ({ ...current, turns: current.turns.map(t => t.id === active.id && t.status === 'running'
        ? { ...t, status: active.controller.signal.aborted ? 'cancelled' : 'failed', error: message } : t) }));
      return null;
    } finally {
      clearTimeout(timer);
      if (this.active === active) { this.active = undefined; this.patch({ busy: false }); }
    }
  }
  async cancel() {
    const active = this.active;
    if (!active) return;
    this.active = undefined; active.controller.abort(); this.patch({ busy: false, error: '' });
    const session = this.workspace.getSession(active.workId);
    if (!session?.turns.some(t => t.id === active.id && t.status === 'running')) return;
    await this.workspace.updateSession(active.workId, current => ({ ...current, turns: current.turns.map(t => t.id === active.id && t.status === 'running'
      ? { ...t, status: 'cancelled', error: '请求已取消，未应用任何结果。' } : t) }));
  }
}
