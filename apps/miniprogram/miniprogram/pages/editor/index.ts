import { conversationOf, conversationView, newSession, type DialogueCommand } from '../../domain/core';
import { ACTION_LABELS, AI_ASSISTANCE_LABEL, VERSION_LABELS, articleText, completeVoice, documentOf, emptyDraft, hasContent, isAppliedAiVersion,
  isWorkAiAssisted, recoverSession, resultSummary, sameDocument,
  splitDraft, type AiAction, type AiTurn, type ArticleSession, type Draft } from '../../domain/core';
import type { MiniAiContext } from '../../ai/controller';
import { miniServices } from '../../services';
import { HoldToDictate, type MiniSpeechState } from '../../speech/session';
import { appendDictation, stageBodyDictation } from '../../speech/dictation';
import { resolveKeyboardInset } from '../../ui/keyboard';
import { navigationMetrics } from '../../ui/navigation';
import { measureTopic } from '../../ui/topic-motion';

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let speechUnsubscribe: (() => void) | undefined;
let aiUnsubscribe: (() => void) | undefined;
let editorVisible = false;
let lifecycleSavePending: Promise<void> | undefined;
let draftVersion = 0;
let baselineWindowHeight = 0;
let keyboardTimer: ReturnType<typeof setTimeout> | undefined;
const speechHold = new HoldToDictate();

const turnStatusLabel: Record<AiTurn['status'], string> = {
  running: '正在处理', ready: '待应用', applied: '已应用', dismissed: '未采用', answered: '已回答', failed: '未完成', cancelled: '已取消',
};

const actionEditLabel = (turn: AiTurn) => turn.action === 'compose' || turn.result?.dialogue?.intent === 'finish'
  ? '整理' : ['chat', 'rewrite', 'dialogue'].includes(turn.action) ? '调整' : '优化';

Page({
  data: {
    ...navigationMetrics(),
    draft: null as Draft | null,
    session: null as ArticleSession | null,
    body: '',
    conversationMessages: [] as ReturnType<typeof conversationView>,
    revision: 0,
    titleDialog: false,
    titleInput: '',
    pendingDialog: false,
    pendingInput: '',
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
    xiaowenTurns: [] as Array<{ id: string; prompt: string; answer: string; status: string; hasCandidate: boolean; canRetry: boolean; canUndo: boolean; editLabel: string; aiLabel: string }>,
    xiaowenVersions: [] as Array<{ id: string; label: string; title: string; length: number; createdAt: string; aiAssisted: boolean }>,
    aiAssisted: false,
    aiAssistanceLabel: AI_ASSISTANCE_LABEL,
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
    voicePhase: 'idle' as MiniSpeechState['phase'],
    voiceText: '',
    voiceMessage: '',
    voiceElapsed: 0,
    voiceBars: Array.from({ length: 12 }, () => 3),
    voiceTarget: '' as '' | 'body' | 'xiaowen',
    voiceBusy: false,
    voicePressing: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    aiUnsubscribe?.();
    aiUnsubscribe = miniServices().articleAi.subscribe(id => {
      if (!editorVisible || this.data.draft?.id !== id) return;
      void miniServices().repository.load().then(snapshot => {
        if (!editorVisible || this.data.draft?.id !== id) return;
        const session = snapshot.recovery?.draft.id === id ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id) ?? null;
        this.setData({ session, xiaowenRunning: miniServices().articleAi.isRunning(id) });
        this.syncXiaoWen(this.data.draft, session);
      }).catch(() => this.setData({ xiaowenError: '小文状态读取失败，请重新打开。' }));
    });
    lifecycleSavePending = undefined;
    draftVersion = 0;
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    baselineWindowHeight = wx.getWindowInfo().windowHeight;
    speechUnsubscribe?.();
    speechUnsubscribe = miniServices().speech.subscribe(state => this.setData({ voicePhase: state.phase, voiceText: state.text,
      voiceMessage: state.message, voiceElapsed: state.elapsed,
      voiceBars: Array.from({ length: 12 }, (_, index) => Math.round(3 + state.level * (7 + (index % 4) * 4))),
      voiceBusy: !['idle', 'error'].includes(state.phase),
      ...(['idle', 'error'].includes(state.phase) ? { voicePressing: false } : {}) }));
    this.setData({ xiaowenOpen: Boolean(options.xiaowen) });
    void this.open(typeof options.id === 'string' ? decodeURIComponent(options.id) : undefined, options.xiaowen === 'compose');
  },

  onShow() { editorVisible = true; measureTopic(this); },
  onResize() { measureTopic(this); },

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
      if (compose) this.setData({ xiaowenOpen: true, xiaowenView: 'chat' });
    } catch (error) {
      // Rendering a loaded conversation must never replace the work with a blank draft.
      this.setData({ error: error instanceof Error ? error.message : '本机作品暂时无法读取。' });
    }
  },

  currentDraft(): Draft | null {
    const draft = this.data.draft;
    if (!draft) return null;
    return { ...draft, textDraft: this.data.body };
  },

  updateDraft(draft: Draft) {
    draftVersion += 1;
    this.setData({ draft, body: draft.inputMode === 'text' ? draft.textDraft : articleText(draft.segments), saved: false, error: '' });
    this.scheduleSave();
  },

  scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void this.saveNow();
    }, 700);
  },

  onBodyInput(event: WechatMiniprogram.TextareaInput) {
    draftVersion += 1;
    this.setData({ body: event.detail.value, saved: false, error: '' });
    this.scheduleSave();
  },

  onKeyboardHeight(event: WechatMiniprogram.TextareaKeyboardHeightChange) {
    const reportedHeight = Math.max(0, event.detail.height);
    if (keyboardTimer) clearTimeout(keyboardTimer);
    if (reportedHeight === 0) {
      this.setData({ keyboardHeight: 0 });
      keyboardTimer = setTimeout(() => {
        const info = wx.getWindowInfo();
        baselineWindowHeight = Math.max(baselineWindowHeight, info.windowHeight);
      }, 40);
      return;
    }
    keyboardTimer = setTimeout(() => {
      const info = wx.getWindowInfo();
      this.setData({ keyboardHeight: resolveKeyboardInset(reportedHeight, baselineWindowHeight, info.windowHeight, info.pixelRatio) });
    }, 16);
  },

  dismissKeyboard() {
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    this.setData({ keyboardHeight: 0 });
    void wx.hideKeyboard({ fail: () => undefined });
  },

  toggleInputMode() {
    const current = this.currentDraft();
    if (!current) return;
    const inputMode = current.inputMode === 'text' ? 'voice' : 'text';
    if (inputMode === 'voice') this.dismissKeyboard();
    const draft: Draft = inputMode === 'voice' ? { ...current, inputMode: 'voice', segments: splitDraft(this.data.body, current.segments) }
      : { ...current, inputMode, textDraft: articleText(current.segments) };
    this.updateDraft(draft);
  },

  focusText() {
    const current = this.currentDraft();
    if (current?.inputMode === 'voice') this.updateDraft({ ...current, inputMode: 'text', textDraft: articleText(current.segments) });
  },

  pressBodyVoice() {
    this.setData({ voiceTarget: 'body', voicePressing: true, notice: '', error: '' });
    speechHold.press(() => void miniServices().speech.start(text => this.acceptBodyDictation(text)));
  },

  pressXiaoWenVoice() {
    if (this.data.operationBusy) return;
    this.setData({ voiceTarget: 'xiaowen', voicePressing: true, xiaowenError: '' });
    speechHold.press(() => void miniServices().speech.start(text => this.acceptXiaoWenDictation(text)));
  },

  releaseVoice() {
    this.setData({ voicePressing: false });
    speechHold.release(() => void miniServices().speech.stop());
  },
  cancelVoice() {
    this.setData({ voicePressing: false });
    speechHold.cancel(() => miniServices().speech.cancel());
  },

  acceptBodyDictation(text: string) {
    const current = this.currentDraft();
    if (!current || !text.trim()) return;
    const result = stageBodyDictation(current, text);
    if (!result.accepted) { this.setData({ error: '正文和待确认文字已到12000字上限，这次语音文字没有写入。' }); return; }
    this.updateDraft(result.draft);
    this.setData({ notice: '', error: result.truncated ? '正文和待确认文字已到12000字上限，只保留了可容纳的部分。' : '' });
  },

  acceptXiaoWenDictation(text: string) {
    const draft = this.data.draft;
    if (!draft || !text.trim()) return;
    const result = appendDictation(this.data.xiaowenComposer, text, 12000, ' ');
    if (!result.accepted) { this.setData({ xiaowenError: '输入已到12000字上限，语音文字没有写入。' }); return; }
    const xiaowenComposer = result.value;
    miniServices().conversations.updateComposer(draft.id, xiaowenComposer, 'dictated');
    this.setData({ xiaowenComposer, xiaowenStatus: 'idle', xiaowenError: result.truncated ? '输入已到12000字上限，只放入了可容纳的语音文字；尚未发送。' : '' });
  },

  openTitle() {
    this.setData({ titleDialog: true, titleInput: this.data.draft?.title ?? '' });
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ titleInput: event.detail.value });
  },

  cancelTitle() {
    this.dismissKeyboard();
    this.setData({ titleDialog: false, titleInput: '' });
  },

  confirmTitle() {
    const current = this.currentDraft();
    if (!current) return;
    const title = this.data.titleInput.slice(0, 120);
    this.dismissKeyboard();
    this.setData({ titleDialog: false, titleInput: '' });
    this.updateDraft({ ...current, title });
  },

  discardPendingVoice() {
    const current = this.currentDraft();
    if (!current) return;
    this.setData({ pendingDialog: false, pendingInput: '' });
    this.updateDraft({ ...current, pendingVoice: '', segmentEdit: null });
  },

  completePendingVoice() {
    const current = this.currentDraft();
    if (!current?.pendingVoice.trim()) return;
    this.setData({ pendingDialog: false, pendingInput: '' });
    this.updateDraft(completeVoice(current));
  },

  openPendingVoice() {
    const pendingVoice = this.data.draft?.pendingVoice ?? '';
    if (!pendingVoice) return;
    this.setData({ pendingDialog: true, pendingInput: pendingVoice });
  },

  onPendingInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ pendingInput: event.detail.value });
  },

  cancelPendingEdit() {
    this.dismissKeyboard();
    this.setData({ pendingDialog: false, pendingInput: '' });
  },

  confirmPendingEdit() {
    const current = this.currentDraft();
    if (!current) return;
    const pendingVoice = this.data.pendingInput.slice(0, 12_000);
    this.dismissKeyboard();
    this.setData({ pendingDialog: false, pendingInput: '' });
    this.updateDraft({ ...current, pendingVoice });
  },

  async saveNow() {
    const draft = this.currentDraft();
    if (!draft || !hasContent(draft)) return true;
    const savingVersion = draftVersion;
    this.setData({ saving: true, error: '' });
    try {
      const work = await miniServices().writer.write(draft, this.data.session ?? undefined);
      const saved = Boolean(work) && savingVersion === draftVersion;
      this.setData({ draft, revision: work?.revision ?? this.data.revision, saving: false, saved, error: '' });
      return saved;
    } catch (error) {
      this.setData({ saving: false, saved: false, error: error instanceof Error ? error.message : '保存失败，当前文字仍保留在页面中。' });
      await miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
      return false;
    }
  },

  async flushAutoSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    } else if (this.data.saving) {
      await miniServices().writer.flush().catch(() => undefined);
      if (this.data.saved) return true;
    }
    if (this.data.saved) return true;
    return this.saveNow();
  },

  syncXiaoWen(draft: Draft | null, session: ArticleSession | null) {
    measureTopic(this);
    const versions = session?.versions ?? [];
    const xiaowenTurns = (session?.turns ?? []).map(turn => {
      const base = versions.find(version => version.id === turn.inputVersionId);
      return { id: turn.id, prompt: turn.prompt || ACTION_LABELS[turn.action],
        answer: turn.result ? resultSummary(turn.result, base?.body ?? '') : turn.error || (turn.status === 'running' ? '小文正在处理…' : ''),
        status: turnStatusLabel[turn.status], hasCandidate: Boolean(turn.result?.body), canRetry: turn.status === 'failed' || turn.status === 'cancelled',
        canUndo: turn.status === 'applied', editLabel: actionEditLabel(turn), aiLabel: turn.result ? AI_ASSISTANCE_LABEL : '' };
    });
    const xiaowenVersions = versions.filter(version => version.body.trim()).slice().reverse().map(version => ({
      id: version.id, label: VERSION_LABELS[version.source], title: version.title || '未命名作品', length: version.body.length, createdAt: version.createdAt,
      aiAssisted: isAppliedAiVersion(session, version.id),
    }));
    this.setData({ conversationMessages: draft ? conversationView(session ?? newSession(draft), draft) : [], xiaowenTurns, xiaowenVersions, aiAssisted: isWorkAiAssisted(session),
      xiaowenRunning: Boolean(draft && miniServices().articleAi.isRunning(draft.id)) });
  },

  adoptAiContext(context: MiniAiContext) {
    this.setData({ draft: context.draft, session: context.session, revision: context.work?.revision ?? this.data.revision,
      body: documentOf(context.draft).body, saved: Boolean(context.work) });
    this.syncXiaoWen(context.draft, context.session);
  },

  async exportRescue() {
    const draft = this.currentDraft();
    if (!draft) return;
    try { await miniServices().backups.rescue(draft, this.data.session); this.setData({ notice: '已打开救援备份分享。' }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '救援导出失败。' }); }
  },

  async openXiaoWen() {
    const draft = this.currentDraft();
    if (draft && conversationOf(this.data.session ?? newSession(draft), draft).mode === 'interview') {
      await miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
      void wx.redirectTo({ url: `/pages/interview/index?id=${encodeURIComponent(draft.id)}` });
      return;
    }
    this.dismissKeyboard();
    this.setData({ xiaowenOpen: true, xiaowenView: 'chat', notice: '' });
    measureTopic(this);
  },

  async startInterview() {
    const draft = this.currentDraft();
    if (!draft || this.data.operationBusy || this.data.voiceBusy) return;
    try {
      this.adoptAiContext(await miniServices().articleAi.startInterview(draft, this.data.session));
      await this.openXiaoWen();
    } catch (error) { this.setData({ xiaowenError: error instanceof Error ? error.message : '模式尚未保存。' }); }
  },

  closeXiaoWen() {
    if (this.data.voiceTarget === 'xiaowen') miniServices().speech.interrupt('小文已收起，已收到的语音文字会保留在输入框。');
    this.dismissKeyboard();
    this.setData({ xiaowenOpen: false, voicePressing: false });
  },
  toggleTopic() { this.setData({ topicOpen: !this.data.topicOpen }); },
  onXiaoWenInput(event: WechatMiniprogram.TextareaInput) {
    const xiaowenComposer = event.detail.value;
    if (this.data.draft) miniServices().conversations.updateComposer(this.data.draft.id, xiaowenComposer, 'typed');
    this.setData({ xiaowenComposer, xiaowenStatus: 'idle', xiaowenError: '' });
  },
  sendXiaoWen() {
    if (this.data.voiceBusy) return;
    const prompt = this.data.xiaowenComposer;
    if (prompt.trim()) void this.runXiaoWen('dialogue', prompt);
  },

  async runXiaoWen(action: AiAction, prompt: string, turnPrompt?: string, command: DialogueCommand = 'send', retryId?: string) {
    const draft = this.currentDraft();
    if (!draft || this.data.operationBusy) return;
    this.setData({ operationBusy: true });
    try {
    if (!await miniServices().aiConsent.ensure()) {
      this.setData({ xiaowenStatus: 'blocked', xiaowenError: '没有发送给小文。您可以继续在本机写作或使用文字、语音转文字。' });
      return;
    }
    this.setData({ operationBusy: true, xiaowenStatus: 'idle', xiaowenError: '' });
    const result = await miniServices().articleAi.run(draft, this.data.session, action, prompt, turnPrompt, started => {
      this.adoptAiContext(started);
      const clearComposer = command === 'send' && !retryId && this.data.xiaowenComposer === prompt;
      if (clearComposer) miniServices().conversations.clearComposer(draft.id);
      this.setData({ ...(clearComposer ? { xiaowenComposer: '' } : {}), xiaowenRunning: true });
    }, command, retryId);
    this.adoptAiContext(result);
    if (!result.accepted) {
      miniServices().conversations.markBlocked(draft.id, result.error);
      this.setData({ xiaowenStatus: 'blocked', xiaowenError: result.error });
    } else if (result.error) this.setData({ xiaowenError: result.error });
    this.setData({ operationBusy: false, xiaowenRunning: false });
    if (editorVisible && this.data.xiaowenOpen && result.session.conversation?.mode === 'interview') await this.openXiaoWen();
    } catch (error) {
      this.setData({ xiaowenError: error instanceof Error ? error.message : '小文状态尚未保存，请重试。' });
    } finally { this.setData({ operationBusy: false }); }
  },

  retryTurn(event: WechatMiniprogram.TouchEvent) {
    const turn = this.data.session?.turns.find(item => item.id === String(event.currentTarget.dataset.id));
    if (!turn) return;
    const prompt = turn.action === 'compose' ? '根据采访回答整理成文章' : turn.prompt;
    void this.runXiaoWen(turn.action, prompt, turn.prompt, turn.command, turn.action === 'dialogue' ? turn.id : undefined);
  },

  cancelXiaoWen() {
    const id = this.data.draft?.id;
    if (!id) return;
    void miniServices().articleAi.cancel(id).then(context => {
      if (context) this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenRunning: false, xiaowenError: '' });
    });
  },

  showCandidate(event: WechatMiniprogram.TouchEvent) { this.openCandidate(String(event.currentTarget.dataset.id)); },
  openCandidate(turnId: string) {
    const draft = this.currentDraft();
    const turn = this.data.session?.turns.find(item => item.id === turnId);
    const base = this.data.session?.versions.find(version => version.id === turn?.inputVersionId);
    if (!draft || !turn?.result?.body || !base) return;
    this.dismissKeyboard();
    this.setData({ xiaowenView: 'preview', selectedTurnId: turnId,
      candidateTitle: actionEditLabel(turn) === '整理' ? '整理后的文章' : '调整后的文章',
      candidateSummary: resultSummary(turn.result, base.body), candidateBody: turn.result.body, candidateOriginalBody: base.body,
      candidateShowOriginal: false, candidateStale: turn.status === 'ready' && !sameDocument(base, documentOf(draft)), candidateStatus: turn.status,
      candidateEditLabel: actionEditLabel(turn), xiaowenError: '' });
  },

  toggleCandidateOriginal() { this.setData({ candidateShowOriginal: !this.data.candidateShowOriginal }); },
  backToConversation() { this.setData({ xiaowenView: 'chat', selectedTurnId: '', xiaowenError: '' }); },
  showHistory() {
    this.dismissKeyboard();
    this.setData({ xiaowenView: 'history', xiaowenError: '' });
  },

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

  async goBack() {
    const saved = await this.flushAutoSave();
    if (!saved) return;
    void wx.navigateBack();
  },

  noop() {},

  preserveAndSave() {
    const draft = this.currentDraft();
    if (!draft || !hasContent(draft) || lifecycleSavePending) return;
    lifecycleSavePending = this.flushAutoSave().then(() => undefined).finally(() => { lifecycleSavePending = undefined; });
  },

  onHide() {
    editorVisible = false;
    miniServices().speech.interrupt();
    speechHold.reset();
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    this.setData({ keyboardHeight: 0, voicePressing: false });
    this.preserveAndSave();
  },

  onUnload() {
    editorVisible = false;
    aiUnsubscribe?.(); aiUnsubscribe = undefined;
    miniServices().speech.interrupt();
    speechHold.reset();
    speechUnsubscribe?.();
    speechUnsubscribe = undefined;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    this.preserveAndSave();
  },
});
