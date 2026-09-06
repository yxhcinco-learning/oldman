import { accountPage } from '../../auth/page';
import { openLogin } from '../../auth/navigation';
import { writingAccess } from '../../sync/writing-access';
import { newSession, recoverSession, conversationOf, conversationView, type DialogueCommand, type ArticleSession, type Draft } from '../../domain/core';
import { miniServices } from '../../services';
import { HoldToDictate, type MiniSpeechState } from '../../speech/session';
import { appendDictation } from '../../speech/dictation';
import { resolveKeyboardInset } from '../../ui/keyboard';
import { navigationMetrics } from '../../ui/navigation';
import { measureTopic } from '../../ui/topic-motion';

let speechUnsubscribe: (() => void) | undefined;
let aiUnsubscribe: (() => void) | undefined;
let baselineWindowHeight = 0;
let keyboardTimer: ReturnType<typeof setTimeout> | undefined;
let pageVisible = false;
const speechHold = new HoldToDictate();

accountPage({
  services: null as unknown as ReturnType<typeof miniServices>,
  cloudUnsubscribe: undefined as (() => void) | undefined,
  accountUnsubscribe: undefined as (() => void) | undefined,
  prepareUnsubscribe: undefined as (() => void) | undefined,
  checkingCloud: false,
  loginOpening: false,
  composerDirty: false,
  composerVersion: 0,
  composerTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  alive: true,
  data: {
    ...navigationMetrics(),
    readOnly: true, cloudVersion: 0, syncLabel: '正在读取', cloudMessage: '', requiresLogin: false, canReconnect: false,
    draft: null as Draft | null,
    session: null as ArticleSession | null,
    revision: 0,
    messages: [] as ReturnType<typeof conversationView>,
    pendingEdit: '',
    mode: 'interview',
    question: '',
    questionAlternative: 0,
    hasAnswers: false,
    composer: '',
    saving: false,
    resultSavePending: false,
    resultSaveMessage: '',
    error: '',
    keyboardHeight: 0,
    voicePhase: 'idle' as MiniSpeechState['phase'],
    voiceText: '',
    voiceMessage: '',
    voiceBusy: false,
    voicePressing: false,
  },

  onShow() {
    pageVisible = true; measureTopic(this);
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
      if (!await this.saveComposer() || services !== miniServices()) return;
      await openLogin({ url: '/pages/interview/index?id=' + encodeURIComponent(id ?? ''), workId: id, source: services });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '登录页暂时无法打开，请重试。' }); }
    finally { this.loginOpening = false; }
  },
  async refreshCloudState() {
    if (!this.alive || this.services !== miniServices()) return;
    if (this.data.cloudVersion && !this.services.sync.canEdit(this.data.draft?.id ?? '', this.data.cloudVersion)) {
      this.setData({ readOnly: true });
      void this.saveComposer();
    }
    const id = this.data.draft?.id;
    const aggregate = id ? await this.services.repository.getAggregate(id) : null;
    if (this.services !== miniServices() || !this.alive || this.data.draft?.id !== id) return;
    if (aggregate && aggregate.work.revision !== this.data.revision && !this.checkingCloud && !this.composerDirty && !this.services.articleAi.isRunning(aggregate.work.id)) {
      await this.open(aggregate.work.id, false); return;
    }
    this.setData({ ...writingAccess(aggregate, this.services.account.snapshot(), this.services.sync, !this.composerDirty),
      ...(this.checkingCloud ? { readOnly: true } : {}) });
  },
  async reconnectCloud() {
    if (this.checkingCloud || !this.data.draft || this.services !== miniServices()) return;
    this.checkingCloud = true;
    this.setData({ readOnly: true, cloudMessage: '正在核对最新作品…' });
    try {
      if (!await this.saveComposer()) return;
      await this.open(this.data.draft.id);
    } finally { this.checkingCloud = false; await this.refreshCloudState(); }
  },

  onResize() { measureTopic(this); },

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
      if (this.services !== miniServices()) { void this.saveComposer(); this.setData({ ...emptyPageData, readOnly: true, cloudMessage: '账号已变化，请返回作品列表。' }); }
      void this.refreshCloudState();
    });
    this.prepareUnsubscribe = this.services.sync.beforeSync(async () => {
      if (!await this.saveComposer()) throw new Error('当前输入尚未保存，云同步已暂停。');
    });
    aiUnsubscribe?.();
    aiUnsubscribe = this.services.articleAi.subscribe(id => {
      if (pageVisible && this.data.draft?.id === id) void this.open(id, false);
    });
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    baselineWindowHeight = wx.getWindowInfo().windowHeight;
    speechUnsubscribe?.();
    speechUnsubscribe = this.services.speech.subscribe(state => this.setData({ voicePhase: state.phase, voiceText: state.text, voiceMessage: state.message,
      voiceBusy: !['idle', 'error'].includes(state.phase),
      ...(['idle', 'error'].includes(state.phase) ? { voicePressing: false } : {}) }));
    void this.open(options.id ? decodeURIComponent(options.id) : '');
  },

  async open(id: string, verify = true) {
    if (this.services !== miniServices() || !this.alive) return;
    this.setData({ readOnly: true });
    try {
      if (id && verify && !this.services.articleAi.isRunning(id)) {
        try { await this.services.sync.open(id); }
        catch (error) { this.setData({ cloudMessage: error instanceof Error ? error.message : '请联网核对云作品。' }); }
      }
      const snapshot = await this.services.repository.load();
      if (this.services !== miniServices() || !this.alive) return;
      this.services.writer.recoverPending(snapshot.pendingSessions ?? []);
      const pending = this.services.writer.pendingSession(id);
      const stored = snapshot.works.find(work => work.id === id);
      const recovering = snapshot.recovery?.draft.id === id;
      const draft = recovering ? snapshot.recovery!.draft : stored?.draft;
      if (!draft) throw new Error('采访话题未找到，请返回热门重新选择。');
      let revision = recovering ? snapshot.recovery!.revision : stored?.revision ?? 0;
      const storedSession = recovering ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id) ?? null;
      const hadInterruptedRequest = storedSession?.turns.some(turn => turn.status === 'running') && !this.services.articleAi.isRunning(id) && !pending;
      let session = storedSession ? (this.services.articleAi.isRunning(id) || pending ? storedSession : recoverSession(storedSession)) : newSession(draft);
      this.services.writer.seed(id, revision);
      const conversation = conversationOf(session, draft);
      if (!session.conversation || hadInterruptedRequest) {
        session = { ...session, conversation };
        const work = await this.services.writer.write(draft, session);
        revision = work?.revision ?? revision;
      }
      if (conversation.mode === 'conversation' && !pending && !this.services.articleAi.isRunning(id) && pageVisible) {
        pageVisible = false;
        void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(id)}&xiaowen=compose` });
        return;
      }
      const persistedInput = (snapshot.recovery?.draft.id === draft.id ? snapshot.recoveryWritingState : undefined) ?? snapshot.writingStates?.find(item => item.workId === draft.id)?.state;
      if (persistedInput && !this.services.articleAi.isRunning(draft.id)) this.services.conversations.hydrate(draft.id, persistedInput);
      const memory = this.services.conversations.read(draft.id);
      measureTopic(this);
      this.setData({ draft, session, revision, mode: conversation.mode, resultSavePending: Boolean(pending),
        resultSaveMessage: pending?.durable ? '回复已留在本机恢复记录中，请先保存到作品。' : '回复仅暂存于内存，请勿关闭微信。',
        messages: conversationView(session, draft).map(message => pending ? { ...message, text: message.pending ? '' : message.text, pending: false, canRetry: false, error: '' } : message)
          .filter(message => message.text || message.error || message.pending || message.hasCandidate), questionAlternative: 0,
        question: '', hasAnswers: conversation.materials.length > 0, pendingEdit: conversation.pendingEdit ?? '', composer: memory.composer,
        saving: this.services.articleAi.isRunning(id),
        error: memory.error || snapshot.issues.map(item => item.message).join(' ') });
      await this.refreshCloudState();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '采访暂时无法打开。' });
    }
  },

  onComposer(event: WechatMiniprogram.TextareaInput) {
    if (!this.allowEditing()) return;
    const composer = event.detail.value;
    if (this.data.draft) this.services.conversations.updateComposer(this.data.draft.id, composer, 'typed');
    this.scheduleComposerSave();
    this.setData({ composer, error: '' });
  },

  scheduleComposerSave() {
    this.composerDirty = true; this.composerVersion++;
    if (this.composerTimer) clearTimeout(this.composerTimer);
    this.composerTimer = setTimeout(() => { this.composerTimer = undefined; void this.saveComposer(); }, 700);
  },
  async saveComposer() {
    if (this.composerTimer) clearTimeout(this.composerTimer);
    this.composerTimer = undefined;
    if (!this.data.draft || !this.composerDirty) return true;
    const version = this.composerVersion;
    try {
      const work = await this.services.writer.write(this.data.draft, this.data.session ?? undefined);
      this.composerDirty = version !== this.composerVersion;
      if (this.services !== miniServices() || !this.alive) return !this.composerDirty;
      this.setData({ revision: work?.revision ?? this.data.revision });
      return !this.composerDirty;
    } catch (error) {
      await this.services.writer.preserve(this.data.draft, this.data.session ?? undefined).catch(() => undefined);
      this.setData({ error: error instanceof Error ? error.message : '输入尚未保存，请重试或救援导出。' }); return false;
    }
  },
  onComposerFocus() {
    const info = wx.getWindowInfo();
    baselineWindowHeight = Math.max(baselineWindowHeight, info.windowHeight);
  },

  onComposerBlur() {
    if (keyboardTimer) clearTimeout(keyboardTimer);
    this.setData({ keyboardHeight: 0 });
    keyboardTimer = setTimeout(() => {
      const info = wx.getWindowInfo();
      baselineWindowHeight = Math.max(baselineWindowHeight, info.windowHeight);
    }, 40);
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

  async sendAnswer() { await this.runDialogue(this.data.composer); },

  async runDialogue(prompt: string, command: DialogueCommand = 'send', retryId?: string) {
    if (!this.allowOnline()) return;
    if (!this.allowEditing()) return;
    const draft = this.data.draft;
    if (!draft || !prompt.trim() || this.data.saving || this.data.voiceBusy || this.data.voicePressing || this.data.resultSavePending) return;
    this.setData({ saving: true, error: '' });
    try {
      if (!await this.services.aiConsent.ensure()) { this.setData({ error: '没有发送给小文，输入仍然保留。' }); return; }
      const result = await this.services.articleAi.run(draft, this.data.session, 'dialogue', prompt, undefined, context => {
        const clearComposer = command === 'send' && !retryId && this.data.composer === prompt;
        if (clearComposer) this.services.conversations.clearComposer(draft.id);
        this.setData({ draft: context.draft, session: context.session, revision: context.work?.revision ?? this.data.revision,
          ...(clearComposer ? { composer: '' } : {}), mode: context.session.conversation!.mode, messages: conversationView(context.session, context.draft) });
        measureTopic(this);
      }, command, retryId);
      if (this.services !== miniServices() || !this.alive) return;
      const conversation = conversationOf(result.session, result.draft);
      this.setData({ draft: result.draft, session: result.session, revision: result.work?.revision ?? this.data.revision,
        mode: conversation.mode, messages: conversationView(result.session, result.draft), pendingEdit: conversation.pendingEdit ?? '',
        hasAnswers: conversation.materials.length > 0, error: result.error });
      if (conversation.mode === 'conversation' && pageVisible && this.alive && this.services === miniServices()) {
        pageVisible = false;
        void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}&xiaowen=compose` });
      }
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '小文暂时没有接上，输入仍然保留。' });
      const pending = this.services.writer.pendingSession(draft.id);
      if (pending) this.setData({ resultSavePending: true, resultSaveMessage: pending.durable ? '回复已留在本机恢复记录中，请先保存到作品。' : '回复仅暂存于内存，请勿关闭微信。',
        messages: this.data.messages.map(message => ({ ...message, text: message.pending ? '' : message.text, pending: false, canRetry: false, error: '' })).filter(message => message.text || message.hasCandidate) });
    } finally { this.setData({ saving: false }); }
  },

  async retryResultSave() {
    if (!this.data.draft || this.data.saving) return;
    this.setData({ saving: true });
    try { await this.services.writer.retrySessionSave(this.data.draft.id); await this.open(this.data.draft.id); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '回复仍未保存，请救援导出。', resultSaveMessage: error instanceof Error ? error.message : '回复仍未保存，请救援导出。' }); }
    finally { this.setData({ saving: false }); }
  },
  async exportRescue() {
    if (!this.data.draft) return;
    try { await this.services.backups.rescue(this.data.draft, this.services.writer.pendingSession(this.data.draft.id)?.context.session ?? this.data.session, this.services.conversations.read(this.data.draft.id)); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '救援导出失败。', resultSaveMessage: error instanceof Error ? error.message : '救援导出失败，请重试保存。' }); }
  },

  changeQuestion() { void this.runDialogue('换个问题', 'change'); },
  confirmEdit() { void this.runDialogue(this.data.pendingEdit, 'confirm-edit'); },
  async continueInterview() {
    if (!this.allowEditing()) return;
    if (!this.data.draft || !this.data.session || this.data.saving || this.data.voiceBusy || this.data.voicePressing || this.data.resultSavePending) return;
    this.setData({ saving: true });
    try {
      const result = await this.services.articleAi.continueInterview(this.data.draft, this.data.session);
      this.setData({ session: result.session, pendingEdit: '' });
    } catch { this.setData({ error: '确认状态尚未保存，请重试。' }); }
    finally { this.setData({ saving: false }); }
  },
  retryTurn(event: WechatMiniprogram.TouchEvent) {
    const turn = this.data.session?.turns.find(item => item.id === String(event.currentTarget.dataset.id));
    if (turn) void this.runDialogue(turn.prompt, turn.command, turn.id);
  },
  cancelRequest() {
    const draft = this.data.draft;
    if (draft) void this.services.articleAi.cancel(draft.id).then(context => {
      if (context) this.setData({ session: context.session, messages: conversationView(context.session, context.draft), saving: false });
    });
  },

  pressDictation() {
    if (!this.allowOnline()) return;
    if (!this.allowEditing()) return;
    if (this.data.saving || this.data.resultSavePending || this.data.voiceBusy || this.data.voicePressing) return;
    this.setData({ error: '', voicePressing: true });
    speechHold.press(() => void this.services.speech.start(text => this.acceptDictation(text)));
  },

  releaseDictation() {
    this.setData({ voicePressing: false });
    speechHold.release(() => void this.services.speech.stop());
  },
  cancelDictation() {
    this.setData({ voicePressing: false });
    speechHold.cancel(() => this.services.speech.cancel());
  },

  acceptDictation(text: string) {
    const draft = this.data.draft;
    if (!draft || !text.trim()) return;
    const result = appendDictation(this.data.composer, text, 12_000, ' ');
    if (!result.accepted) { this.setData({ error: '回答已到12000字上限，语音文字没有写入。' }); return; }
    const composer = result.value;
    this.services.conversations.updateComposer(draft.id, composer, 'dictated');
    this.setData({ composer, error: result.truncated ? '回答已到12000字上限，只放入了可容纳的语音文字；尚未发送。' : '' });
  },

  async closeInterview() {
    const draft = this.data.draft;
    if (!draft) { void wx.reLaunch({ url: '/pages/home/index' }); return; }
    if (!await this.saveComposer()) return;
    pageVisible = false;
    void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}` });
  },

  async composeArticle() { await this.runDialogue('结束访谈并整理', 'finish'); },
  async toggleInterview() {
    if (!this.allowEditing()) return;
    if (this.data.saving || this.data.voiceBusy || this.data.voicePressing || this.data.resultSavePending || !this.data.draft) return;
    if (this.data.mode === 'interview') { await this.composeArticle(); return; }
    this.setData({ saving: true, error: '' });
    try {
      await this.services.articleAi.startInterview(this.data.draft, this.data.session);
      await this.open(this.data.draft.id);
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '访谈尚未开启，请重试。' }); }
    finally { this.setData({ saving: false }); }
  },

  onHide() {
    void this.saveComposer();
    pageVisible = false;
    this.services.speech.interrupt();
    speechHold.reset();
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    this.setData({ keyboardHeight: 0, voicePressing: false });
  },

  onUnload() {
    void this.saveComposer();
    this.alive = false;
    this.cloudUnsubscribe?.(); this.accountUnsubscribe?.(); this.prepareUnsubscribe?.();
    aiUnsubscribe?.(); aiUnsubscribe = undefined;
    this.services.speech.interrupt();
    speechHold.reset();
    speechUnsubscribe?.();
    speechUnsubscribe = undefined;
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
  },
}, page => page.saveComposer());
