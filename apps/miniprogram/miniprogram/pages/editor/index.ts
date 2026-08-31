import { ACTION_LABELS, VERSION_LABELS, articleText, documentOf, emptyDraft, hasContent, recoverSession, resultSummary, sameDocument,
  splitDraft, type AiAction, type AiTurn, type ArticleSession, type Draft } from '../../domain/core';
import type { MiniAiContext } from '../../ai/controller';
import { miniServices } from '../../services';

let saveTimer: ReturnType<typeof setTimeout> | undefined;

const turnStatusLabel: Record<AiTurn['status'], string> = {
  running: '正在处理', ready: '待应用', applied: '已应用', dismissed: '未采用', answered: '已回答', failed: '未完成', cancelled: '已取消',
};

const actionEditLabel = (action: AiAction) => action === 'compose' ? '整理' : action === 'chat' || action === 'rewrite' ? '调整' : '优化';

Page({
  data: {
    draft: null as Draft | null,
    session: null as ArticleSession | null,
    body: '',
    revision: 0,
    titleDialog: false,
    titleInput: '',
    saving: false,
    saved: false,
    error: '',
    notice: '',
    keyboardHeight: 0,
    topicOpen: false,
    topicSources: [] as Array<{ id: string; title: string; route: string }>,
    xiaowenOpen: false,
    xiaowenComposer: '',
    xiaowenStatus: 'idle' as 'idle' | 'blocked',
    xiaowenError: '',
    xiaowenView: 'chat' as 'chat' | 'preview' | 'history',
    xiaowenTurns: [] as Array<{ id: string; prompt: string; answer: string; status: string; hasCandidate: boolean; canRetry: boolean; canUndo: boolean; editLabel: string }>,
    xiaowenVersions: [] as Array<{ id: string; label: string; title: string; length: number; createdAt: string }>,
    xiaowenRunning: false,
    selectedTurnId: '',
    candidateTitle: '',
    candidateSummary: '',
    candidateBody: '',
    candidateOriginalBody: '',
    candidateShowOriginal: false,
    candidateStale: false,
    candidateStatus: '' as AiTurn['status'] | '',
    candidateEditLabel: '调整',
    operationBusy: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ xiaowenOpen: Boolean(options.xiaowen) });
    void this.open(typeof options.id === 'string' ? decodeURIComponent(options.id) : undefined, options.xiaowen === 'compose');
  },

  async open(id?: string, compose = false) {
    try {
      const snapshot = await miniServices().repository.load();
      const stored = id ? snapshot.works.find(work => work.id === id && !work.deletedAt) : undefined;
      const useRecovery = snapshot.recovery && (!id || snapshot.recovery.draft.id === id);
      const draft = useRecovery ? snapshot.recovery!.draft : stored?.draft ?? emptyDraft();
      const revision = useRecovery ? snapshot.recovery!.revision : stored?.revision ?? 0;
      const storedSession = useRecovery ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === draft.id) ?? null;
      const hadInterruptedRequest = Boolean(storedSession?.turns.some(turn => turn.status === 'running')) && !miniServices().articleAi.isRunning(draft.id);
      const session = storedSession && hadInterruptedRequest ? recoverSession(storedSession) : storedSession;
      miniServices().writer.seed(draft.id, revision);
      const conversation = miniServices().conversations.read(draft.id);
      this.setData({ draft, session, revision, body: draft.inputMode === 'text' ? draft.textDraft : articleText(draft.segments),
        saved: Boolean(stored) && !useRecovery, error: '', notice: snapshot.issues.map(item => item.message).join(' '),
        xiaowenComposer: conversation.composer, xiaowenStatus: conversation.requestStatus, xiaowenError: conversation.error,
        topicSources: draft.topicSnapshot?.sources.map(source => ({ id: source.id, title: source.title,
          route: `/pages/source/index?url=${encodeURIComponent(source.url)}&title=${encodeURIComponent(source.title)}` })) ?? [] });
      this.syncXiaoWen(draft, session);
      if (session && hadInterruptedRequest) void miniServices().writer.preserve(draft, session).catch(() => undefined);
      if (compose) void this.runXiaoWen('compose', '根据采访回答整理成文章', '整理成文章');
    } catch (error) {
      const draft = emptyDraft();
      miniServices().writer.seed(draft.id, 0);
      this.setData({ draft, body: '', error: error instanceof Error ? error.message : '本机作品暂时无法读取。' });
    }
  },

  currentDraft(): Draft | null {
    const draft = this.data.draft;
    if (!draft) return null;
    return { ...draft, textDraft: this.data.body };
  },

  updateDraft(draft: Draft) {
    this.setData({ draft, body: draft.inputMode === 'text' ? draft.textDraft : articleText(draft.segments), saved: false, error: '' });
    this.scheduleSave();
  },

  scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void this.saveNow(), 700);
  },

  onBodyInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ body: event.detail.value, saved: false, error: '' });
    this.scheduleSave();
  },

  onKeyboardHeight(event: WechatMiniprogram.TextareaKeyboardHeightChange) {
    this.setData({ keyboardHeight: event.detail.height });
  },

  toggleInputMode() {
    const current = this.currentDraft();
    if (!current) return;
    const inputMode = current.inputMode === 'text' ? 'voice' : 'text';
    const draft: Draft = inputMode === 'voice' ? { ...current, inputMode: 'voice', segments: splitDraft(this.data.body, current.segments) }
      : { ...current, inputMode, textDraft: articleText(current.segments) };
    this.updateDraft(draft);
  },

  focusText() {
    const current = this.currentDraft();
    if (current?.inputMode === 'voice') this.updateDraft({ ...current, inputMode: 'text', textDraft: articleText(current.segments) });
  },

  voiceUnavailable() {
    this.setData({ notice: '录音尚未连接到服务端；语音转写以后只会放入当前输入框，不会自动发送或改动正文。' });
  },

  openTitle() {
    this.setData({ titleDialog: true, titleInput: this.data.draft?.title ?? '' });
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ titleInput: event.detail.value });
  },

  cancelTitle() {
    this.setData({ titleDialog: false, titleInput: '' });
  },

  confirmTitle() {
    const current = this.currentDraft();
    if (!current) return;
    const title = this.data.titleInput.slice(0, 120);
    this.setData({ titleDialog: false, titleInput: '' });
    this.updateDraft({ ...current, title });
  },

  async saveNow() {
    const draft = this.currentDraft();
    if (!draft || !hasContent(draft)) return;
    this.setData({ saving: true, error: '', notice: '' });
    try {
      const work = await miniServices().writer.write(draft, this.data.session ?? undefined);
      this.setData({ draft, revision: work?.revision ?? this.data.revision, saving: false, saved: Boolean(work),
        notice: work ? '已保存到当前设备' : '' });
    } catch (error) {
      this.setData({ saving: false, saved: false, error: error instanceof Error ? error.message : '保存失败，当前文字仍保留在页面中。' });
      await miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
    }
  },

  syncXiaoWen(draft: Draft | null, session: ArticleSession | null) {
    const versions = session?.versions ?? [];
    const xiaowenTurns = (session?.turns ?? []).map(turn => {
      const base = versions.find(version => version.id === turn.inputVersionId);
      return { id: turn.id, prompt: turn.prompt || ACTION_LABELS[turn.action],
        answer: turn.result ? resultSummary(turn.result, base?.body ?? '') : turn.error || (turn.status === 'running' ? '小文正在处理…' : ''),
        status: turnStatusLabel[turn.status], hasCandidate: Boolean(turn.result?.body), canRetry: turn.status === 'failed' || turn.status === 'cancelled',
        canUndo: turn.status === 'applied', editLabel: actionEditLabel(turn.action) };
    });
    const xiaowenVersions = versions.filter(version => version.body.trim()).slice().reverse().map(version => ({
      id: version.id, label: VERSION_LABELS[version.source], title: version.title || '未命名作品', length: version.body.length, createdAt: version.createdAt,
    }));
    this.setData({ xiaowenTurns, xiaowenVersions, xiaowenRunning: Boolean(draft && miniServices().articleAi.isRunning(draft.id)) });
  },

  adoptAiContext(context: MiniAiContext) {
    this.setData({ draft: context.draft, session: context.session, revision: context.work?.revision ?? this.data.revision,
      body: documentOf(context.draft).body, saved: Boolean(context.work) });
    this.syncXiaoWen(context.draft, context.session);
  },

  async exportRescue() {
    const draft = this.currentDraft();
    if (!draft) return;
    try { await miniServices().backups.rescue(draft); this.setData({ notice: '已打开救援备份分享。' }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '救援导出失败。' }); }
  },

  async openXiaoWen() {
    const draft = this.currentDraft();
    if (draft?.topicWritingMode === 'interview' && draft.topicSnapshot) {
      await miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
      void wx.redirectTo({ url: `/pages/interview/index?id=${encodeURIComponent(draft.id)}` });
      return;
    }
    this.setData({ xiaowenOpen: true, xiaowenView: 'chat', notice: '' });
  },

  closeXiaoWen() { this.setData({ xiaowenOpen: false }); },
  toggleTopic() { this.setData({ topicOpen: !this.data.topicOpen }); },
  onXiaoWenInput(event: WechatMiniprogram.TextareaInput) {
    const xiaowenComposer = event.detail.value;
    if (this.data.draft) miniServices().conversations.updateComposer(this.data.draft.id, xiaowenComposer, 'typed');
    this.setData({ xiaowenComposer, xiaowenStatus: 'idle', xiaowenError: '' });
  },
  sendXiaoWen() {
    const prompt = this.data.xiaowenComposer.trim();
    if (prompt) void this.runXiaoWen('chat', prompt);
  },

  async runXiaoWen(action: AiAction, prompt: string, turnPrompt?: string) {
    const draft = this.currentDraft();
    if (!draft || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenStatus: 'idle', xiaowenError: '' });
    const result = await miniServices().articleAi.run(draft, this.data.session, action, prompt, turnPrompt, started => {
      this.adoptAiContext(started);
      miniServices().conversations.clearComposer(draft.id);
      this.setData({ xiaowenComposer: '', xiaowenRunning: true });
    });
    this.adoptAiContext(result);
    if (!result.accepted) {
      miniServices().conversations.markBlocked(draft.id, result.error);
      this.setData({ xiaowenStatus: 'blocked', xiaowenError: result.error });
    } else if (result.error) this.setData({ xiaowenError: result.error });
    this.setData({ operationBusy: false, xiaowenRunning: false });
    const turn = result.turnId ? result.session.turns.find(item => item.id === result.turnId) : undefined;
    if (turn?.status === 'ready' && turn.result?.body) this.openCandidate(turn.id);
  },

  retryTurn(event: WechatMiniprogram.TouchEvent) {
    const turn = this.data.session?.turns.find(item => item.id === String(event.currentTarget.dataset.id));
    if (!turn) return;
    const prompt = turn.action === 'compose' ? '根据采访回答整理成文章' : turn.prompt;
    void this.runXiaoWen(turn.action, prompt, turn.prompt);
  },

  cancelXiaoWen() {
    const id = this.data.draft?.id;
    if (!id) return;
    void miniServices().articleAi.cancel(id).then(context => {
      if (context) this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenRunning: false, xiaowenError: '已取消请求，正文未改变。' });
    });
  },

  showCandidate(event: WechatMiniprogram.TouchEvent) { this.openCandidate(String(event.currentTarget.dataset.id)); },
  openCandidate(turnId: string) {
    const draft = this.currentDraft();
    const turn = this.data.session?.turns.find(item => item.id === turnId);
    const base = this.data.session?.versions.find(version => version.id === turn?.inputVersionId);
    if (!draft || !turn?.result?.body || !base) return;
    this.setData({ xiaowenView: 'preview', selectedTurnId: turnId,
      candidateTitle: turn.action === 'compose' ? '看看整理后的文章' : '看看调整后的全文',
      candidateSummary: resultSummary(turn.result, base.body), candidateBody: turn.result.body, candidateOriginalBody: base.body,
      candidateShowOriginal: false, candidateStale: !sameDocument(base, documentOf(draft)), candidateStatus: turn.status,
      candidateEditLabel: actionEditLabel(turn.action), xiaowenError: '' });
  },

  toggleCandidateOriginal() { this.setData({ candidateShowOriginal: !this.data.candidateShowOriginal }); },
  backToConversation() { this.setData({ xiaowenView: 'chat', selectedTurnId: '', xiaowenError: '' }); },
  showHistory() { this.setData({ xiaowenView: 'history', xiaowenError: '' }); },

  async applyCandidate() {
    const draft = this.currentDraft();
    const session = this.data.session;
    if (!draft || !session || !this.data.selectedTurnId || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    try {
      const context = await miniServices().articleAi.apply(draft, session, this.data.selectedTurnId);
      this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenView: 'chat', notice: `已应用${this.data.candidateEditLabel}并保存到本机。` });
    } catch (error) { this.setData({ operationBusy: false, xiaowenError: error instanceof Error ? error.message : '候选暂时无法应用。' }); }
  },

  async dismissCandidate() {
    const draft = this.currentDraft();
    const session = this.data.session;
    if (!draft || !session || !this.data.selectedTurnId || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    try {
      const context = await miniServices().articleAi.dismiss(draft, session, this.data.selectedTurnId);
      this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenView: 'chat', notice: '未采用，正文没有变化。' });
    } catch (error) { this.setData({ operationBusy: false, xiaowenError: error instanceof Error ? error.message : '候选暂时无法放弃。' }); }
  },

  undoTurn(event: WechatMiniprogram.TouchEvent) {
    const turnId = String(event.currentTarget.dataset.id);
    const draft = this.currentDraft();
    const session = this.data.session;
    if (!draft || !session || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    void miniServices().articleAi.undo(draft, session, turnId).then(context => {
      this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenView: 'chat', notice: '已恢复修改前内容，并保留修改记录。' });
    }).catch(error => this.setData({ operationBusy: false, xiaowenError: error instanceof Error ? error.message : '这次修改暂时无法撤销。' }));
  },

  goBack() {
    void wx.navigateBack();
  },

  noop() {},

  preserveAndSave() {
    const draft = this.currentDraft();
    if (!draft || !hasContent(draft)) return;
    void miniServices().writer.preserve(draft, this.data.session ?? undefined)
      .then(() => this.saveNow()).catch(() => undefined);
  },

  onHide() {
    this.preserveAndSave();
  },

  onUnload() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    this.preserveAndSave();
  },
});
