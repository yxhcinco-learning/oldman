import { ACTION_LABELS, MAX_ARTICLE_CHARS, aiResponseSchema, buildAiRequest, checkpointSession, documentOf, newId, newSession,
  newVersion, recoverSession, sameDocument, splitDraft, type AiAction, type AiRequest, type AiResponse, type AiTurn,
  type ArticleSession, type Draft, type Work } from '../domain/core';
import type { MiniDraftWriter, MiniWorkRepository } from '../storage/repository';
import { MiniSessionSaveError } from '../storage/repository';
import { prepareDialogue, settleDialogue, startInterview, type DialogueCommand } from '../domain/core';

const zodParseContext = { jitless: true } as const;

export interface MiniAiOperation {
  response: Promise<AiResponse>;
  cancel(): void;
}

export interface MiniAiTransport {
  request(request: AiRequest): MiniAiOperation;
}

export class UnavailableMiniAiTransport implements MiniAiTransport {
  request() {
    return { response: Promise.reject(new Error('小文在线服务尚未建立业务会话，请稍后再试。')), cancel() {} };
  }
}

export interface MiniAiContext {
  draft: Draft;
  session: ArticleSession;
  work: Work | null;
}

export interface MiniAiRunResult extends MiniAiContext {
  accepted: boolean;
  turnId: string | null;
  error: string;
}

type ActiveRequest = { workId: string; turnId: string; cancel(): void; timer: ReturnType<typeof setTimeout>;
  cancelled: boolean; settlement?: Promise<MiniAiContext> };

function validationMessage(draft: Draft, action: AiAction, prompt: string, busy: boolean) {
  const body = documentOf(draft).body;
  if (busy) return '小文正在处理上一条请求，请稍候。';
  if (!['interview', 'compose', 'dialogue'].includes(action) && !body.trim()) return '先写下一句，再请小文帮忙。';
  if (action === 'interview' && !body.trim() && !draft.topicSnapshot && !draft.materials.length) return '先选一个话题，或在文章里写下一点内容。';
  if (action === 'compose' && !draft.materials.some(material => material.selected)) return '还没有可以整理的回答。';
  if (action !== 'dialogue' && (draft.pendingVoice.trim() || draft.segmentEdit)) return '请先取消或完成待确认语音，再使用小文。';
  if (body.length > MAX_ARTICLE_CHARS) return '每篇最多 12000 字，请先分篇整理。原文不会被截断。';
  if (prompt.length > (action === 'dialogue' ? 12000 : 2000) || ['question', 'rewrite', 'chat', 'dialogue'].includes(action) && !prompt.trim()) return '请输入长度范围内的问题或调整要求。';
  return '';
}

export class MiniArticleAiController {
  private active: ActiveRequest | null = null;
  private preparation: { workId: string } | null = null;
  private listeners = new Set<(workId: string) => void>();
  subscribe(listener: (workId: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  constructor(private readonly repository: MiniWorkRepository, private readonly writer: MiniDraftWriter,
    private readonly transport: MiniAiTransport = new UnavailableMiniAiTransport()) {}

  isRunning(workId: string) {
    return this.active?.workId === workId || this.preparation?.workId === workId;
  }
  async cancelActive(message = '在线会话已中断，已收到的内容保留在本机。') {
    if (this.active) await this.cancel(this.active.workId, message);
  }

  async startInterview(draft: Draft, session: ArticleSession | null) {
    if (this.writer.pendingSession(draft.id)) throw new Error('请先保存小文已收到的回复。');
    if (this.active || this.preparation) throw new Error('小文正在处理上一条请求，请稍候。');
    this.preparation = { workId: draft.id };
    try { return await this.save(draft, startInterview(session ?? newSession(draft), draft, newId())); }
    finally { this.preparation = null; }
  }

  async run(draft: Draft, existingSession: ArticleSession | null, action: AiAction, prompt = '', turnPrompt?: string,
    onStarted?: (context: MiniAiContext & { turnId: string }) => void, command: DialogueCommand = 'send', retryId?: string): Promise<MiniAiRunResult> {
    if (this.writer.pendingSession(draft.id)) return { draft, session: existingSession ?? newSession(draft), work: null, accepted: false, turnId: null, error: '请先保存小文已收到的回复，不需要重新发送。' };
    if (this.active || this.preparation) return { draft, session: existingSession ?? newSession(draft), work: null, accepted: false, turnId: null, error: '小文正在处理上一条请求，请稍候。' };
    const preparation = { workId: draft.id };
    this.preparation = preparation;
    try { return await this.execute(draft, existingSession, action, prompt, turnPrompt, onStarted, command, retryId); }
    finally { if (this.preparation === preparation) this.preparation = null; this.listeners.forEach(listener => listener(draft.id)); }
  }

  private async execute(draft: Draft, existingSession: ArticleSession | null, action: AiAction, prompt: string, turnPrompt?: string,
    onStarted?: (context: MiniAiContext & { turnId: string }) => void, command: DialogueCommand = 'send', retryId?: string): Promise<MiniAiRunResult> {
    const error = validationMessage(draft, action, prompt, Boolean(this.active));
    const fallbackSession = existingSession ? (this.active ? existingSession : recoverSession(existingSession)) : newSession(draft);
    if (error) return { draft, session: fallbackSession, work: null, accepted: false, turnId: null, error };

    let session = checkpointSession(fallbackSession, draft);
    const turnId = retryId ?? newId();
    if (retryId && !session.turns.some(turn => turn.id === retryId && ['failed', 'cancelled'].includes(turn.status))) return { draft, session, work: null, accepted: false, turnId: null, error: '这条消息不能重试。' };
    let request: AiRequest;
    try {
      if (action === 'dialogue') session = prepareDialogue(session, draft, turnId, prompt, command);
      request = buildAiRequest(session, action, prompt.trim(), turnId, { topicSnapshot: draft.topicSnapshot, materials: draft.materials, command });
    }
    catch (failure) { return { draft, session: fallbackSession, work: null, accepted: false, turnId: null,
      error: failure instanceof Error && failure.name !== 'ZodError' ? failure.message : '当前内容无法建立小文请求，原文未改变。' }; }
    const turn: AiTurn = { id: turnId, createdAt: new Date().toISOString(), action, ...(action === 'dialogue' ? { command } : {}),
      prompt: turnPrompt?.trim() || (prompt.trim() || ACTION_LABELS[action]), inputVersionId: request.current.id,
      status: 'running', omittedRecords: request.omittedRecords };
    session = { ...session, turns: [...session.turns.filter(item => item.id !== turnId), turn] };

    let work: Work | null;
    if (action === 'dialogue' && command === 'send' && !retryId) this.writer.clearComposerIfMatches(draft.id, prompt);
    try { work = await this.writer.write(draft, session); }
    catch (failure) {
      return { draft, session: fallbackSession, work: null, accepted: false, turnId: null,
        error: failure instanceof Error ? failure.message : '会话尚未保存，暂未发送小文请求。' };
    }
    onStarted?.({ draft, session, work, turnId });

    let operation: MiniAiOperation;
    try { operation = this.transport.request(request); }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : '小文请求未能开始，原文未改变。';
      const settled = await this.settle(turnId, current => ({ ...current, status: 'failed', error: message }));
      return { ...settled, accepted: true, turnId, error: message };
    }
    const active: ActiveRequest = { workId: draft.id, turnId, cancel: operation.cancel,
      timer: setTimeout(() => this.cancel(draft.id, '小文请求已超时，原文未改变。'), 125000), cancelled: false };
    this.active = active;
    this.preparation = null;
    try {
      const response = aiResponseSchema.parse(await operation.response, zodParseContext);
      if (active.cancelled) return { ...(await active.settlement!), accepted: true, turnId, error: '' };
      if (this.active !== active) return { ...(await this.latest(draft.id)), accepted: true, turnId, error: '' };
      if (response.requestId !== turnId) throw new Error('小文返回结果无法核对，原文未改变。');
      const allowedVersions = new Set([request.current.id, ...request.versions.map(version => version.id)]);
      if (response.result.citedVersionIds.some(id => !allowedVersions.has(id))) throw new Error('小文引用的修改记录无法核对，请重新发送。');
      const result = ['question', 'interview'].includes(action) ? { ...response.result, body: undefined } : response.result;
      if (['regular', 'polish', 'rewrite'].includes(action) && !result.body?.trim()) throw new Error('小文没有返回可核对的完整正文，原文未改变。');
      const settled = await this.settle(turnId, current => ({ ...current, result,
        status: result.body ? 'ready' : 'answered', error: undefined }), { draft, session, work });
      return { ...settled, accepted: true, turnId, error: '' };
    } catch (failure) {
      if (failure instanceof MiniSessionSaveError) throw failure;
      if (active.cancelled) return { ...(await active.settlement!), accepted: true, turnId, error: '' };
      if (this.active !== active) return { ...(await this.latest(draft.id)), accepted: true, turnId, error: '' };
      const message = failure instanceof Error && failure.name !== 'ZodError' ? failure.message : '小文连接或数据格式异常，原文未改变。';
      const settled = await this.settle(turnId, current => ({ ...current, status: 'failed', error: message }));
      return { ...settled, accepted: true, turnId, error: message };
    } finally {
      clearTimeout(active.timer);
      if (this.active === active && !active.cancelled) this.active = null;
    }
  }

  async cancel(workId: string, message = '已取消请求，原文未改变。') {
    const active = this.active;
    if (!active || active.workId !== workId) return null;
    active.cancelled = true;
    clearTimeout(active.timer);
    active.cancel();
    active.settlement = this.settle(active.turnId, current => ({ ...current, status: 'cancelled', error: message }));
    try { return await active.settlement; }
    finally { if (this.active === active) this.active = null; }
  }

  async dismiss(draft: Draft, session: ArticleSession, turnId: string) {
    const turn = session.turns.find(item => item.id === turnId);
    if (!turn || turn.status !== 'ready') throw new Error('这份结果已不能放弃。');
    return this.save(draft, { ...session, turns: session.turns.map(item => item.id === turnId ? { ...item, status: 'dismissed' } : item) });
  }

  async continueInterview(draft: Draft, session: ArticleSession) {
    if (this.isRunning(draft.id) || session.conversation?.mode !== 'interview') throw new Error('当前不能更改访谈确认。');
    return this.save(draft, { ...session, conversation: { ...session.conversation, pendingEdit: undefined } });
  }

  async apply(draft: Draft, session: ArticleSession, turnId: string) {
    const turn = session.turns.find(item => item.id === turnId);
    const base = session.versions.find(version => version.id === turn?.inputVersionId);
    if (!turn || turn.status !== 'ready' || !turn.result?.body || !base) throw new Error('这份结果已不能应用。');
    if (draft.pendingVoice.trim() || draft.segmentEdit || !sameDocument(base, documentOf(draft))) {
      throw new Error('正文已发生变化，请根据最新内容重新整理；旧结果仍可查看。');
    }
    const nextDraft: Draft = { ...draft, inputMode: 'text', textDraft: turn.result.body, segments: splitDraft(turn.result.body, draft.segments) };
    if (!['regular', 'polish', 'rewrite', 'chat', 'compose', 'dialogue'].includes(turn.action)) throw new Error('这类回答不会改动正文。');
    const source: 'regular' | 'polish' | 'rewrite' = turn.action === 'regular' || turn.action === 'polish' ? turn.action : 'rewrite';
    const version = newVersion(nextDraft, source);
    return this.save(nextDraft, { ...session, versions: [...session.versions, version],
      turns: session.turns.map(item => item.id === turnId ? { ...item, status: 'applied', appliedVersionId: version.id } : item) });
  }

  async undo(draft: Draft, session: ArticleSession, turnId: string) {
    const turn = session.turns.find(item => item.id === turnId);
    const before = session.versions.find(version => version.id === turn?.inputVersionId);
    const after = session.versions.find(version => version.id === turn?.appliedVersionId);
    if (!turn || turn.status !== 'applied' || turn.revertedVersionId || !before || !after) throw new Error('这次修改已不能撤销。');
    if (draft.pendingVoice.trim() || draft.segmentEdit || !sameDocument(after, documentOf(draft))) {
      throw new Error('应用后正文又有修改，请先核对修改记录。');
    }
    const nextDraft: Draft = { ...draft, title: before.title, inputMode: 'text', textDraft: before.body,
      segments: splitDraft(before.body, draft.segments) };
    const restored = newVersion(nextDraft, 'restore');
    return this.save(nextDraft, { ...session, versions: [...session.versions, restored],
      turns: session.turns.map(item => item.id === turnId ? { ...item, revertedVersionId: restored.id } : item) });
  }

  async restoreVersion(draft: Draft, session: ArticleSession, versionId: string, expected: { title: string; body: string }) {
    if (this.isRunning(draft.id)) throw new Error('请等小文回复完成后再恢复。');
    const version = session.versions.find(item => item.id === versionId);
    if (!version) throw new Error('这条修改记录已不存在。');
    if (draft.pendingVoice.trim() || draft.segmentEdit || !sameDocument(documentOf(draft), expected)) {
      throw new Error('正文已有新修改，请重新查看记录后再恢复。');
    }
    if (sameDocument(version, expected)) throw new Error('当前正文已经是这一版。');
    const preserved = checkpointSession(session, draft);
    const nextDraft: Draft = { ...draft, title: version.title, inputMode: 'text', textDraft: version.body, segments: splitDraft(version.body, draft.segments) };
    return this.save(nextDraft, { ...preserved, versions: [...preserved.versions, newVersion(nextDraft, 'restore')] });
  }

  private async latest(workId: string): Promise<MiniAiContext> {
    await this.writer.flush();
    const snapshot = await this.repository.load();
    const recovery = snapshot.recovery?.draft.id === workId ? snapshot.recovery : null;
    const work = snapshot.works.find(item => item.id === workId && !item.deletedAt) ?? null;
    const draft = recovery?.draft ?? work?.draft;
    const session = recovery ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === workId);
    if (!draft || !session) throw new Error('当前文章会话已不存在。');
    this.writer.seed(workId, recovery?.revision ?? work?.revision ?? 0);
    return { draft, session, work };
  }

  private async settle(turnId: string, update: (turn: AiTurn) => AiTurn, fallback?: MiniAiContext): Promise<MiniAiContext> {
    const reduce = (current: ArticleSession): ArticleSession => {
      const turn = current.turns.find(item => item.id === turnId && item.status === 'running');
      if (!turn) return current;
      const next = update(turn);
      if (turn.action === 'dialogue' && next.result) return settleDialogue(current, turnId, next.result);
      return { ...current, turns: current.turns.map(item => item.id === turnId ? next : item) };
    };
    const activeWorkId = this.active?.turnId === turnId ? this.active.workId : undefined;
    if (!activeWorkId) {
      const snapshot = await this.repository.load();
      const session = snapshot.sessions.find(item => item.turns.some(turn => turn.id === turnId))
        ?? (snapshot.recoverySession?.turns.some(turn => turn.id === turnId) ? snapshot.recoverySession : undefined);
      if (!session) throw new Error('当前文章会话已不存在。');
      return this.writer.updateLatestSession(session.workId, reduce);
    }
    return this.writer.updateLatestSession(activeWorkId, reduce, fallback);
  }

  private async save(draft: Draft, session: ArticleSession): Promise<MiniAiContext> {
    const work = await this.writer.write(draft, session);
    return { draft, session, work };
  }
}
