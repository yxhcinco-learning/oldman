import { openLogin } from '../../auth/navigation';
import { writingAccess } from '../../sync/writing-access';
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
  services: null as unknown as ReturnType<typeof miniServices>,
  cloudUnsubscribe: undefined as (() => void) | undefined,
  accountUnsubscribe: undefined as (() => void) | undefined,
  prepareUnsubscribe: undefined as (() => void) | undefined,
  checkingCloud: false,
  loginOpening: false,
  alive: true,
  data: {
    ...navigationMetrics(),
    readOnly: true, cloudVersion: 0, syncLabel: '正在读取', cloudMessage: '', requiresLogin: false, canReconnect: false,
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
    xiaowenView: 'chat' as 'chat' | 'preview' | 'history' | 'version',
    selectedVersionId: '',
    versionBody: '',
    versionTitle: '',
    versionBaseline: { title: '', body: '' },
    versionSame: false,
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
    navigationSaving: false,
    resultSavePending: false,
    resultSaveMessage: '',
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
    const emptyPageData = { ...this.data };
    this.services = miniServices();
    const render = this.setData.bind(this);
    this.setData = (values, callback) => {
      if (this.services === miniServices() || Object.prototype.hasOwnProperty.call(values, 'draft') && (values as { draft?: unknown }).draft === null) render(values, callback);
    };
    this.alive = true;
    this.cloudUnsubscribe = this.services.sync.subscribe(() => { void this.refreshCloudState(); });
    this.accountUnsubscribe = this.services.account.subscribe(() => {
      if (this.services !== miniServices()) { void this.flushAutoSave(); this.setData({ ...emptyPageData, readOnly: true, cloudMessage: '账号已变化，请返回作品列表。' }); }
      void this.refreshCloudState();
    });
    this.prepareUnsubscribe = this.services.sync.beforeSync(async () => {
      if (!await this.flushAutoSave()) throw new Error('当前输入尚未保存，云同步已暂停。');
    });
    aiUnsubscribe?.();
    aiUnsubscribe = this.services.articleAi.subscribe(id => {
      if (!editorVisible || this.data.draft?.id !== id) return;
      void this.services.repository.load().then(snapshot => {
        if (!editorVisible || this.data.draft?.id !== id) return;
        this.services.writer.recoverPending(snapshot.pendingSessions ?? []);
        const session = snapshot.recovery?.draft.id === id ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id) ?? null;
        this.setData({ session, xiaowenRunning: this.services.articleAi.isRunning(id) });
        this.syncXiaoWen(this.data.draft, session);
      }).catch(() => this.setData({ xiaowenError: '小文状态读取失败，请重新打开。' }));
    });
    lifecycleSavePending = undefined;
    draftVersion = 0;
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    baselineWindowHeight = wx.getWindowInfo().windowHeight;
    speechUnsubscribe?.();
    speechUnsubscribe = this.services.speech.subscribe(state => this.setData({ voicePhase: state.phase, voiceText: state.text,
      voiceMessage: state.message, voiceElapsed: state.elapsed,
      voiceBars: Array.from({ length: 12 }, (_, index) => Math.round(3 + state.level * (7 + (index % 4) * 4))),
      voiceBusy: !['idle', 'error'].includes(state.phase),
      ...(['idle', 'error'].includes(state.phase) ? { voicePressing: false } : {}) }));
    this.setData({ xiaowenOpen: Boolean(options.xiaowen) });
    void this.open(typeof options.id === 'string' ? decodeURIComponent(options.id) : undefined, options.xiaowen === 'compose');
  },

  onShow() {
    editorVisible = true; measureTopic(this);
    if (this.services && this.services !== miniServices()) { void wx.reLaunch({ url: '/pages/works/index' }); return; }
    if (this.data.draft) void this.reconnectCloud();
  },

  allowEditing() {
    if (this.data.resultSavePending || this.data.voiceBusy || this.data.voicePressing) return false;
    if (this.services !== miniServices() || this.data.readOnly) {
      this.setData({ cloudMessage: this.data.cloudMessage || '请联网核对最新作品后继续。' }); return false;
    }
    return true;
  },
  allowOnline() {
    if (this.data.resultSavePending || this.data.voiceBusy || this.data.voicePressing) return false;
    if (this.services !== miniServices()) return false;
    const status = this.services.account.snapshot().status;
    if (['guest', 'expired', 'replaced'].includes(status)) { void this.goToAccount(); return false; }
    if (status !== 'authenticated') {
      this.setData({ cloudMessage: '网络不可用，请联网后重试。' }); return false;
    }
    return true;
  },
  async goToAccount() {
    if (this.loginOpening || this.services !== miniServices()) return;
    this.loginOpening = true;
    const services = this.services;
    const id = this.data.draft?.id;
    try {
      if (!await this.flushAutoSave() || services !== miniServices()) return;
      await openLogin({ url: '/pages/editor/index?id=' + encodeURIComponent(id ?? '') + (this.data.xiaowenOpen ? '&xiaowen=compose' : ''), workId: id, source: services });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '登录页暂时无法打开，请重试。' }); }
    finally { this.loginOpening = false; }
  },
  async refreshCloudState() {
    if (!this.alive || this.services !== miniServices()) return;
    if (this.data.cloudVersion && !this.services.sync.canEdit(this.data.draft?.id ?? '', this.data.cloudVersion)) {
      this.setData({ readOnly: true });
      void this.flushAutoSave();
    }
    const id = this.data.draft?.id;
    const aggregate = id ? await this.services.repository.getAggregate(id) : null;
    if (this.services !== miniServices() || !this.alive || this.data.draft?.id !== id) return;
    if (aggregate && aggregate.work.revision !== this.data.revision && !this.checkingCloud && this.data.saved && !this.services.articleAi.isRunning(aggregate.work.id)) {
      await this.open(aggregate.work.id, false, false); return;
    }
    this.setData({ ...writingAccess(aggregate, this.services.account.snapshot(), this.services.sync, this.data.saved || !aggregate),
      ...(this.checkingCloud ? { readOnly: true } : {}) });
  },
  async reconnectCloud() {
    if (this.checkingCloud || !this.data.draft || this.services !== miniServices()) return;
    this.checkingCloud = true;
    this.setData({ readOnly: true, cloudMessage: '正在核对最新作品…' });
    try {
      if (!await this.flushAutoSave()) return;
      await this.open(this.data.draft.id);
    } finally { this.checkingCloud = false; await this.refreshCloudState(); }
  },

  onResize() { measureTopic(this); },

  async open(id?: string, compose = false, verify = true) {
    if (this.services !== miniServices() || !this.alive) return;
    this.setData({ readOnly: true });
    try {
      if (id && verify) {
        try { await this.services.sync.open(id); }
        catch (error) { this.setData({ cloudMessage: error instanceof Error ? error.message : '请联网核对云作品。' }); }
      }
      const snapshot = await this.services.repository.load();
      if (this.services !== miniServices() || !this.alive) return;
      this.services.writer.recoverPending(snapshot.pendingSessions ?? []);
      const stored = id ? snapshot.works.find(work => work.id === id && !work.deletedAt) : undefined;
      if (id && !stored && snapshot.recovery?.draft.id !== id) throw new Error('这篇作品已删除或不属于当前账号。');
      const useRecovery = snapshot.recovery && (!id || snapshot.recovery.draft.id === id);
      const draft = useRecovery ? snapshot.recovery!.draft : stored?.draft ?? emptyDraft();
      const revision = useRecovery ? snapshot.recovery!.revision : stored?.revision ?? 0;
      const storedSession = useRecovery ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === draft.id) ?? null;
      const hadInterruptedRequest = Boolean(storedSession?.turns.some(turn => turn.status === 'running')) && !this.services.articleAi.isRunning(draft.id) && !this.services.writer.pendingSession(draft.id);
      const session = storedSession && hadInterruptedRequest ? recoverSession(storedSession) : storedSession;
      this.services.writer.seed(draft.id, revision);
      const persistedInput = (snapshot.recovery?.draft.id === draft.id ? snapshot.recoveryWritingState : undefined) ?? snapshot.writingStates?.find(item => item.workId === draft.id)?.state;
      if (persistedInput && !this.services.articleAi.isRunning(draft.id)) this.services.conversations.hydrate(draft.id, persistedInput);
      const conversation = this.services.conversations.read(draft.id);
      this.setData({ draft, session, revision, body: draft.inputMode === 'text' ? draft.textDraft : articleText(draft.segments),
        saved: Boolean(stored) && !useRecovery, error: '', notice: snapshot.issues.map(item => item.message).join(' '),
        xiaowenComposer: conversation.composer, xiaowenStatus: conversation.requestStatus, xiaowenError: conversation.error,
        topicSources: draft.topicSnapshot?.sources.map(source => ({ id: source.id, title: source.title,
          route: `/pages/source/index?url=${encodeURIComponent(source.url)}&title=${encodeURIComponent(source.title)}` })) ?? [] });
      this.syncXiaoWen(draft, session);
      if (session && hadInterruptedRequest) {
        const work = await this.services.writer.write(draft, session);
        this.setData({ revision: work?.revision ?? revision, saved: Boolean(work) });
      }
      await this.refreshCloudState();
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
    if (!this.allowEditing()) return;
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
    if (!this.allowEditing()) return;
    const current = this.currentDraft();
    if (!current) return;
    const inputMode = current.inputMode === 'text' ? 'voice' : 'text';
    if (inputMode === 'voice') this.dismissKeyboard();
    const draft: Draft = inputMode === 'voice' ? { ...current, inputMode: 'voice', segments: splitDraft(this.data.body, current.segments) }
      : { ...current, inputMode, textDraft: articleText(current.segments) };
    this.updateDraft(draft);
  },

  focusText() {
    if (!this.allowEditing()) return;
    const current = this.currentDraft();
    if (current?.inputMode === 'voice') this.updateDraft({ ...current, inputMode: 'text', textDraft: articleText(current.segments) });
  },

  pressBodyVoice() {
    if (!this.allowOnline()) return;
    if (!this.allowEditing()) return;
    if (this.data.xiaowenOpen || this.data.voiceBusy || this.data.voicePressing) return;
    this.setData({ voiceTarget: 'body', voicePressing: true, notice: '', error: '' });
    speechHold.press(() => void this.services.speech.start(text => this.acceptBodyDictation(text)));
  },

  pressXiaoWenVoice() {
    if (!this.allowOnline()) return;
    if (!this.allowEditing()) return;
    if (this.data.operationBusy || this.data.resultSavePending || this.data.voiceBusy || this.data.voicePressing) return;
    this.setData({ voiceTarget: 'xiaowen', voicePressing: true, xiaowenError: '' });
    speechHold.press(() => void this.services.speech.start(text => this.acceptXiaoWenDictation(text)));
  },

  releaseVoice() {
    this.setData({ voicePressing: false });
    speechHold.release(() => void this.services.speech.stop());
  },
  cancelVoice() {
    this.setData({ voicePressing: false });
    speechHold.cancel(() => this.services.speech.cancel());
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
    this.services.conversations.updateComposer(draft.id, xiaowenComposer, 'dictated');
    draftVersion += 1; this.setData({ saved: false }); this.scheduleSave();
    this.setData({ xiaowenComposer, xiaowenStatus: 'idle', xiaowenError: result.truncated ? '输入已到12000字上限，只放入了可容纳的语音文字；尚未发送。' : '' });
  },

  openTitle() {
    if (!this.allowEditing()) return;
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
    if (!this.allowEditing()) return;
    const current = this.currentDraft();
    if (!current) return;
    const title = this.data.titleInput.slice(0, 120);
    this.dismissKeyboard();
    this.setData({ titleDialog: false, titleInput: '' });
    this.updateDraft({ ...current, title });
  },

  discardPendingVoice() {
    if (!this.allowEditing()) return;
    const current = this.currentDraft();
    if (!current) return;
    this.setData({ pendingDialog: false, pendingInput: '' });
    this.updateDraft({ ...current, pendingVoice: '', segmentEdit: null });
  },

  completePendingVoice() {
    if (!this.allowEditing()) return;
    const current = this.currentDraft();
    if (!current?.pendingVoice.trim()) return;
    this.setData({ pendingDialog: false, pendingInput: '' });
    this.updateDraft(completeVoice(current));
  },

  openPendingVoice() {
    if (!this.allowEditing()) return;
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
    if (!this.allowEditing()) return;
    const current = this.currentDraft();
    if (!current) return;
    const pendingVoice = this.data.pendingInput.slice(0, 12_000);
    this.dismissKeyboard();
    this.setData({ pendingDialog: false, pendingInput: '' });
    this.updateDraft({ ...current, pendingVoice });
  },

  async saveNow() {
    if (this.data.resultSavePending) { await this.retryResultSave(); return !this.data.resultSavePending && this.data.saved; }
    const draft = this.currentDraft();
    if (!draft || !hasContent(draft) && !this.data.xiaowenComposer.trim() && !this.data.revision) return true;
    const savingVersion = draftVersion;
    this.setData({ saving: true, error: '' });
    try {
      const work = await this.services.writer.write(draft, this.data.session ?? undefined);
      if (this.services !== miniServices() || !this.alive) return Boolean(work);
      const saved = Boolean(work) && savingVersion === draftVersion;
      this.setData({ ...(savingVersion === draftVersion ? { draft } : {}), revision: work?.revision ?? this.data.revision, saving: false, saved, error: '' });
      void this.refreshCloudState();
      return saved;
    } catch (error) {
      this.setData({ saving: false, saved: false, error: error instanceof Error ? error.message : '保存失败，当前文字仍保留在页面中。' });
      await this.services.writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
      return false;
    }
  },

  async flushAutoSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    } else if (this.data.saving) {
      await this.services.writer.flush().catch(() => undefined);
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
        canUndo: turn.status === 'applied' && !turn.revertedVersionId && Boolean(draft && sameDocument(versions.find(version => version.id === turn.appliedVersionId) ?? { title: '', body: '' }, documentOf(draft))), editLabel: actionEditLabel(turn), aiLabel: turn.result ? AI_ASSISTANCE_LABEL : '' };
    });
    const xiaowenVersions = versions.slice().reverse().map(version => ({
      id: version.id, label: VERSION_LABELS[version.source], title: version.title || '未命名作品', length: version.body.length, createdAt: version.createdAt,
      aiAssisted: isAppliedAiVersion(session, version.id),
    }));
    const pending = draft ? this.services.writer.pendingSession(draft.id) : undefined;
    const visibleSession = pending && session ? recoverSession(session) : session;
    this.setData({ resultSavePending: Boolean(pending), resultSaveMessage: pending?.durable ? '回复已留在本机恢复记录中，请先保存到作品。' : '回复仅暂存于内存，请勿关闭微信。',
      conversationMessages: draft ? conversationView(visibleSession ?? newSession(draft), draft).map(message => pending ? { ...message, text: message.pending ? '' : message.text, pending: false, canRetry: false, error: '' } : message)
        .filter(message => message.text || message.error || message.pending || message.hasCandidate) : [], xiaowenTurns, xiaowenVersions, aiAssisted: isWorkAiAssisted(session),
      xiaowenRunning: Boolean(draft && this.services.articleAi.isRunning(draft.id)) });
  },

  adoptAiContext(context: MiniAiContext) {
    if (!this.alive || this.services !== miniServices()) return;
    this.setData({ draft: context.draft, session: context.session, revision: context.work?.revision ?? this.data.revision,
      body: documentOf(context.draft).body, saved: Boolean(context.work) });
    this.syncXiaoWen(context.draft, context.session);
  },

  async exportRescue() {
    const draft = this.currentDraft();
    if (!draft) return;
    const pending = this.services.writer.pendingSession(draft.id);
    try { await this.services.backups.rescue(draft, pending?.context.session ?? this.data.session, this.services.conversations.read(draft.id)); this.setData({ notice: '已打开救援备份分享。' }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '救援导出失败。',
      ...(pending ? { resultSaveMessage: error instanceof Error ? error.message : '救援导出失败，请重试保存。' } : {}) }); }
  },

  async retryResultSave() {
    const id = this.data.draft?.id;
    if (!id || this.data.operationBusy) return;
    this.setData({ operationBusy: true });
    try {
      const context = await this.services.writer.retrySessionSave(id);
      const draft = this.currentDraft();
      // Body typing while the reply was pending remains the author's current input.
      this.adoptAiContext(draft ? { ...context, draft } : context);
      this.setData({ error: '', xiaowenError: '', resultSavePending: false, saved: draft ? sameDocument(documentOf(draft), documentOf(context.draft)) : true });
      if (draft && !this.data.saved) this.scheduleSave();
      if (context.session.conversation?.mode === 'interview') await this.openXiaoWen();
    } catch (error) {
      this.setData({ xiaowenError: error instanceof Error ? error.message : '回复仍未保存，请救援导出。' });
      this.syncXiaoWen(this.data.draft, this.data.session);
      this.setData({ resultSaveMessage: error instanceof Error ? error.message : '回复仍未保存，请救援导出。' });
    }
    finally { this.setData({ operationBusy: false }); }
  },

  async openXiaoWen() {
    if (this.data.navigationSaving) return;
    if (['guest', 'expired', 'replaced'].includes(this.services.account.snapshot().status)) {
      this.setData({ xiaowenOpen: true });
      await this.goToAccount();
      this.setData({ xiaowenOpen: false });
      return;
    }
    const draft = this.currentDraft();
    if (draft && this.services.writer.pendingSession(draft.id)) {
      this.setData({ xiaowenOpen: true, xiaowenView: 'chat', resultSavePending: true });
      this.syncXiaoWen(draft, this.data.session);
      return;
    }
    if (draft && conversationOf(this.data.session ?? newSession(draft), draft).mode === 'interview') {
      this.setData({ navigationSaving: true, error: '' });
      const savingVersion = draftVersion;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined; }
      try {
        if (!await this.flushAutoSave()) return;
        if (savingVersion !== draftVersion) {
          this.setData({ error: '刚才又有新的输入，请保存后再打开小文。' });
          return;
        }
        await wx.redirectTo({ url: `/pages/interview/index?id=${encodeURIComponent(draft.id)}` });
      } catch (error) {
        this.setData({ saved: false, error: error instanceof Error ? error.message : '尚未保存，当前文字仍在本页。请重试保存或救援导出。' });
      } finally { this.setData({ navigationSaving: false }); }
      return;
    }
    this.dismissKeyboard();
    this.setData({ xiaowenOpen: true, xiaowenView: 'chat', notice: '' });
    measureTopic(this);
  },

  async startInterview() {
    if (!this.allowEditing()) return;
    const draft = this.currentDraft();
    if (!draft || this.data.operationBusy || this.data.voiceBusy || this.data.voicePressing || this.data.resultSavePending) return;
    try {
      this.adoptAiContext(await this.services.articleAi.startInterview(draft, this.data.session));
      await this.openXiaoWen();
    } catch (error) { this.setData({ xiaowenError: error instanceof Error ? error.message : '模式尚未保存。' }); }
  },

  closeXiaoWen() {
    if (this.data.voiceTarget === 'xiaowen') this.services.speech.interrupt('小文已收起，已收到的语音文字会保留在输入框。');
    this.dismissKeyboard();
    this.setData({ xiaowenOpen: false, voicePressing: false });
  },
  toggleTopic() { this.setData({ topicOpen: !this.data.topicOpen }); },
  onXiaoWenInput(event: WechatMiniprogram.TextareaInput) {
    if (!this.allowEditing()) return;
    const xiaowenComposer = event.detail.value;
    if (this.data.draft) this.services.conversations.updateComposer(this.data.draft.id, xiaowenComposer, 'typed');
    draftVersion += 1;
    this.setData({ xiaowenComposer, xiaowenStatus: 'idle', xiaowenError: '', saved: false });
    this.scheduleSave();
  },
  sendXiaoWen() {
    if (this.data.voiceBusy) return;
    const prompt = this.data.xiaowenComposer;
    if (prompt.trim()) void this.runXiaoWen('dialogue', prompt);
  },

  async runXiaoWen(action: AiAction, prompt: string, turnPrompt?: string, command: DialogueCommand = 'send', retryId?: string) {
    if (!this.allowOnline()) return;
    if (!this.allowEditing()) return;
    const draft = this.currentDraft();
    if (!draft || this.data.operationBusy || this.data.voiceBusy || this.data.voicePressing || this.data.resultSavePending) return;
    this.setData({ operationBusy: true });
    try {
    if (!await this.services.aiConsent.ensure()) {
      this.setData({ xiaowenStatus: 'blocked', xiaowenError: '没有发送给小文。您可以继续在本机写作或使用文字、语音转文字。' });
      return;
    }
    this.setData({ operationBusy: true, xiaowenStatus: 'idle', xiaowenError: '' });
    const result = await this.services.articleAi.run(draft, this.data.session, action, prompt, turnPrompt, started => {
      this.adoptAiContext(started);
      const clearComposer = command === 'send' && !retryId && this.data.xiaowenComposer === prompt;
      if (clearComposer) this.services.conversations.clearComposer(draft.id);
      this.setData({ ...(clearComposer ? { xiaowenComposer: '' } : {}), xiaowenRunning: true });
    }, command, retryId);
    if (this.services !== miniServices() || !this.alive) return;
    this.adoptAiContext(result);
    if (!result.accepted) {
      this.services.conversations.markBlocked(draft.id, result.error);
      this.setData({ xiaowenStatus: 'blocked', xiaowenError: result.error });
    } else if (result.error) this.setData({ xiaowenError: result.error });
    this.setData({ operationBusy: false, xiaowenRunning: false });
    if (this.alive && this.services === miniServices() && editorVisible && this.data.xiaowenOpen && result.session.conversation?.mode === 'interview') await this.openXiaoWen();
    } catch (error) {
      this.setData({ xiaowenError: error instanceof Error ? error.message : '小文状态尚未保存，请重试。' });
      this.syncXiaoWen(this.data.draft, this.data.session);
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
    void this.services.articleAi.cancel(id).then(context => {
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
  backToConversation() { this.setData({ xiaowenView: this.data.xiaowenView === 'version' ? 'history' : 'chat', selectedTurnId: '', xiaowenError: '' }); },
  showHistory() {
    this.dismissKeyboard();
    this.setData({ xiaowenView: 'history', xiaowenError: '' });
  },

  showVersion(event: WechatMiniprogram.TouchEvent) {
    const version = this.data.session?.versions.find(item => item.id === String(event.currentTarget.dataset.id));
    const draft = this.currentDraft();
    if (!version || !draft) return;
    this.setData({ xiaowenView: 'version', selectedVersionId: version.id, versionBody: version.body,
      versionTitle: version.title || '未命名作品', versionBaseline: documentOf(draft), versionSame: sameDocument(version, documentOf(draft)), xiaowenError: '' });
  },

  async restoreVersion() {
    if (!this.allowEditing()) return;
    if (!this.data.session || this.data.operationBusy || this.data.resultSavePending) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    try {
      const confirm = await wx.showModal({ title: '恢复这版文章？', content: '当前文章会保留在修改记录中。', confirmText: '确认恢复', cancelText: '再看看' });
      if (!confirm.confirm) return;
      const draft = this.currentDraft();
      if (!draft) return;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined; }
      const context = await this.services.articleAi.restoreVersion(draft, this.data.session, this.data.selectedVersionId, this.data.versionBaseline);
      this.adoptAiContext(context);
      this.setData({ xiaowenView: 'history', notice: '已恢复这一版，原内容仍在修改记录中。' });
    } catch (error) { this.setData({ xiaowenError: error instanceof Error ? error.message : '恢复失败，原文未改变。' }); }
    finally { this.setData({ operationBusy: false }); }
  },

  async applyCandidate() {
    if (!this.allowEditing()) return;
    const draft = this.currentDraft();
    const session = this.data.session;
    if (!draft || !session || !this.data.selectedTurnId || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    try {
      const context = await this.services.articleAi.apply(draft, session, this.data.selectedTurnId);
      this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenView: 'chat', notice: `已应用${this.data.candidateEditLabel}并保存到本机。` });
    } catch (error) { this.setData({ operationBusy: false, xiaowenError: error instanceof Error ? error.message : '候选暂时无法应用。' }); }
  },

  async dismissCandidate() {
    if (!this.allowEditing()) return;
    const draft = this.currentDraft();
    const session = this.data.session;
    if (!draft || !session || !this.data.selectedTurnId || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    try {
      const context = await this.services.articleAi.dismiss(draft, session, this.data.selectedTurnId);
      this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenView: 'chat', notice: '未采用，正文没有变化。' });
    } catch (error) { this.setData({ operationBusy: false, xiaowenError: error instanceof Error ? error.message : '候选暂时无法放弃。' }); }
  },

  undoTurn(event: WechatMiniprogram.TouchEvent) {
    if (!this.allowEditing()) return;
    const turnId = String(event.currentTarget.dataset.id);
    const draft = this.currentDraft();
    const session = this.data.session;
    if (!draft || !session || this.data.operationBusy) return;
    this.setData({ operationBusy: true, xiaowenError: '' });
    void this.services.articleAi.undo(draft, session, turnId).then(context => {
      this.adoptAiContext(context);
      this.setData({ operationBusy: false, xiaowenView: 'chat', notice: '已恢复修改前内容，并保留修改记录。' });
    }).catch(error => this.setData({ operationBusy: false, xiaowenError: error instanceof Error ? error.message : '这次修改暂时无法撤销。' }));
  },

  async goBack() {
    const saved = await this.flushAutoSave();
    if (!saved) return;
    if (getCurrentPages().length < 2) { void wx.switchTab({ url: '/pages/works/index' }); return; }
    void wx.navigateBack({ fail: () => void wx.switchTab({ url: '/pages/works/index' }) });
  },

  noop() {},

  preserveAndSave() {
    const draft = this.currentDraft();
    if (!draft || lifecycleSavePending) return;
    lifecycleSavePending = this.flushAutoSave().then(() => undefined).finally(() => { lifecycleSavePending = undefined; });
  },

  onHide() {
    editorVisible = false;
    this.services.speech.interrupt();
    speechHold.reset();
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    this.setData({ keyboardHeight: 0, voicePressing: false });
    this.preserveAndSave();
  },

  onUnload() {
    this.alive = false;
    this.cloudUnsubscribe?.(); this.accountUnsubscribe?.(); this.prepareUnsubscribe?.();
    editorVisible = false;
    aiUnsubscribe?.(); aiUnsubscribe = undefined;
    this.services.speech.interrupt();
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
