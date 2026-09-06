import { newSession, recoverSession, conversationOf, conversationView, type DialogueCommand, type ArticleSession, type Draft } from '../../domain/core';
import { miniServices } from '../../services';
import { HoldToDictate, type MiniSpeechState } from '../../speech/session';
import { appendDictation } from '../../speech/dictation';
import { resolveKeyboardInset } from '../../ui/keyboard';
import { navigationMetrics } from '../../ui/navigation';

let speechUnsubscribe: (() => void) | undefined;
let aiUnsubscribe: (() => void) | undefined;
let baselineWindowHeight = 0;
let keyboardTimer: ReturnType<typeof setTimeout> | undefined;
let pageVisible = false;
const speechHold = new HoldToDictate();

Page({
  data: {
    ...navigationMetrics(),
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
    error: '',
    keyboardHeight: 0,
    voicePhase: 'idle' as MiniSpeechState['phase'],
    voiceText: '',
    voiceMessage: '',
    voiceBusy: false,
    voicePressing: false,
  },

  onShow() { pageVisible = true; },

  onLoad(options: Record<string, string | undefined>) {
    aiUnsubscribe?.();
    aiUnsubscribe = miniServices().articleAi.subscribe(id => {
      if (pageVisible && this.data.draft?.id === id) void this.open(id);
    });
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    baselineWindowHeight = wx.getWindowInfo().windowHeight;
    speechUnsubscribe?.();
    speechUnsubscribe = miniServices().speech.subscribe(state => this.setData({ voicePhase: state.phase, voiceText: state.text, voiceMessage: state.message,
      voiceBusy: !['idle', 'error'].includes(state.phase),
      ...(['idle', 'error'].includes(state.phase) ? { voicePressing: false } : {}) }));
    void this.open(options.id ? decodeURIComponent(options.id) : '');
  },

  async open(id: string) {
    try {
      const snapshot = await miniServices().repository.load();
      const stored = snapshot.works.find(work => work.id === id);
      const recovering = snapshot.recovery?.draft.id === id;
      const draft = recovering ? snapshot.recovery!.draft : stored?.draft;
      if (!draft) throw new Error('采访话题未找到，请返回热门重新选择。');
      const revision = recovering ? snapshot.recovery!.revision : stored?.revision ?? 0;
      const storedSession = recovering ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id) ?? null;
      let session = storedSession ? (miniServices().articleAi.isRunning(id) ? storedSession : recoverSession(storedSession)) : newSession(draft);
      miniServices().writer.seed(id, revision);
      const conversation = conversationOf(session, draft);
      if (!session.conversation) {
        session = { ...session, conversation };
        await miniServices().writer.write(draft, session);
      }
      if (conversation.mode === 'conversation' && !miniServices().articleAi.isRunning(id) && pageVisible) {
        pageVisible = false;
        void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(id)}&xiaowen=compose` });
        return;
      }
      const memory = miniServices().conversations.read(draft.id);
      this.setData({ draft, session, revision, mode: conversation.mode, messages: conversationView(session, draft), questionAlternative: 0,
        question: '', hasAnswers: conversation.materials.length > 0, pendingEdit: conversation.pendingEdit ?? '', composer: memory.composer,
        saving: miniServices().articleAi.isRunning(id),
        error: memory.error || snapshot.issues.map(item => item.message).join(' ') });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '采访暂时无法打开。' });
    }
  },

  onComposer(event: WechatMiniprogram.TextareaInput) {
    const composer = event.detail.value;
    if (this.data.draft) miniServices().conversations.updateComposer(this.data.draft.id, composer, 'typed');
    this.setData({ composer, error: '' });
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
    const draft = this.data.draft;
    if (!draft || !prompt.trim() || this.data.saving || this.data.voiceBusy) return;
    this.setData({ saving: true, error: '' });
    try {
      if (!await miniServices().aiConsent.ensure()) { this.setData({ error: '没有发送给小文，输入仍然保留。' }); return; }
      const result = await miniServices().articleAi.run(draft, this.data.session, 'dialogue', prompt, undefined, context => {
        miniServices().conversations.clearComposer(draft.id);
        this.setData({ draft: context.draft, session: context.session, revision: context.work?.revision ?? this.data.revision,
          composer: '', mode: context.session.conversation!.mode, messages: conversationView(context.session, context.draft) });
      }, command, retryId);
      const conversation = conversationOf(result.session, result.draft);
      this.setData({ draft: result.draft, session: result.session, revision: result.work?.revision ?? this.data.revision,
        messages: conversationView(result.session, result.draft), pendingEdit: conversation.pendingEdit ?? '',
        hasAnswers: conversation.materials.length > 0, error: result.error });
      if (conversation.mode === 'conversation' && pageVisible) {
        pageVisible = false;
        void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}&xiaowen=compose` });
      }
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '小文暂时没有接上，输入仍然保留。' });
    } finally { this.setData({ saving: false }); }
  },

  changeQuestion() { void this.runDialogue('换个问题', 'change'); },
  confirmEdit() { void this.runDialogue(this.data.pendingEdit, 'confirm-edit'); },
  async continueInterview() {
    if (!this.data.draft || !this.data.session || this.data.saving) return;
    this.setData({ saving: true });
    try {
      const result = await miniServices().articleAi.continueInterview(this.data.draft, this.data.session);
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
    if (draft) void miniServices().articleAi.cancel(draft.id).then(context => {
      if (context) this.setData({ session: context.session, messages: conversationView(context.session, context.draft), saving: false });
    });
  },

  pressDictation() {
    if (this.data.saving) return;
    this.setData({ error: '', voicePressing: true });
    speechHold.press(() => void miniServices().speech.start(text => this.acceptDictation(text)));
  },

  releaseDictation() {
    this.setData({ voicePressing: false });
    speechHold.release(() => void miniServices().speech.stop());
  },
  cancelDictation() {
    this.setData({ voicePressing: false });
    speechHold.cancel(() => miniServices().speech.cancel());
  },

  acceptDictation(text: string) {
    const draft = this.data.draft;
    if (!draft || !text.trim()) return;
    const result = appendDictation(this.data.composer, text, 12_000, ' ');
    if (!result.accepted) { this.setData({ error: '回答已到12000字上限，语音文字没有写入。' }); return; }
    const composer = result.value;
    miniServices().conversations.updateComposer(draft.id, composer, 'dictated');
    this.setData({ composer, error: result.truncated ? '回答已到12000字上限，只放入了可容纳的语音文字；尚未发送。' : '' });
  },

  async closeInterview() {
    const draft = this.data.draft;
    if (!draft) { void wx.reLaunch({ url: '/pages/home/index' }); return; }
    pageVisible = false;
    void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}` });
  },

  async composeArticle() { await this.runDialogue('结束访谈并整理', 'finish'); },

  onHide() {
    pageVisible = false;
    miniServices().speech.interrupt();
    speechHold.reset();
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    this.setData({ keyboardHeight: 0, voicePressing: false });
  },

  onUnload() {
    aiUnsubscribe?.(); aiUnsubscribe = undefined;
    miniServices().speech.interrupt();
    speechHold.reset();
    speechUnsubscribe?.();
    speechUnsubscribe = undefined;
    if (keyboardTimer) clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
  },
});
