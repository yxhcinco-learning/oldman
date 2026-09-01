import { newId, newSession, type ArticleSession, type Draft, type WritingMaterial } from '../../domain/core';
import { interviewMessages, interviewQuestion, type InterviewMessage } from '../../interview/flow';
import { miniServices } from '../../services';
import { HoldToDictate, type MiniSpeechState } from '../../speech/session';
import { appendDictation } from '../../speech/dictation';
import { navigationMetrics } from '../../ui/navigation';

let speechUnsubscribe: (() => void) | undefined;
const speechHold = new HoldToDictate();

Page({
  data: {
    ...navigationMetrics(),
    draft: null as Draft | null,
    session: null as ArticleSession | null,
    revision: 0,
    messages: [] as InterviewMessage[],
    question: '',
    questionAlternative: 0,
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

  onLoad(options: Record<string, string | undefined>) {
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
      if (!draft?.topicSnapshot) throw new Error('采访话题未找到，请返回热门重新选择。');
      const revision = recovering ? snapshot.recovery!.revision : stored?.revision ?? 0;
      const session = recovering ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === id) ?? null;
      miniServices().writer.seed(id, revision);
      const answers = draft.materials.filter(item => item.source === 'interview-answer');
      const memory = miniServices().conversations.read(draft.id);
      this.setData({ draft, session, revision, messages: interviewMessages(answers), questionAlternative: 0,
        question: interviewQuestion(draft.topicSnapshot, answers.length), composer: memory.composer,
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

  onKeyboardHeight(event: WechatMiniprogram.TextareaKeyboardHeightChange) {
    this.setData({ keyboardHeight: event.detail.height });
  },

  async sendAnswer() {
    const draft = this.data.draft;
    const answer = this.data.composer.trim();
    if (!draft || !answer || this.data.saving || this.data.voiceBusy) return;
    const material: WritingMaterial = { id: newId(), source: 'interview-answer', text: answer, question: this.data.question,
      createdAt: new Date().toISOString(), selected: true };
    const next = { ...draft, materials: [...draft.materials, material] };
    const session = this.data.session ?? newSession(next);
    this.setData({ saving: true, error: '' });
    try {
      const work = await miniServices().writer.write(next, session);
      miniServices().conversations.clearComposer(draft.id);
      const answers = next.materials.filter(item => item.source === 'interview-answer');
      this.setData({ draft: next, session, revision: work?.revision ?? this.data.revision, composer: '', saving: false, questionAlternative: 0,
        question: interviewQuestion(next.topicSnapshot!, answers.length), messages: [...this.data.messages,
          { id: `${material.id}-question`, role: 'assistant', text: material.question! }, { id: material.id, role: 'user', text: answer }] });
    } catch (error) {
      this.setData({ saving: false, error: error instanceof Error ? error.message : '回答尚未保存，请重试。' });
    }
  },

  changeQuestion() {
    const topic = this.data.draft?.topicSnapshot;
    if (!topic) return;
    const completedAnswers = this.data.draft!.materials.filter(item => item.source === 'interview-answer').length;
    const questionAlternative = this.data.questionAlternative + 1;
    this.setData({ questionAlternative, question: interviewQuestion(topic, completedAnswers, questionAlternative) });
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
    const hasConversation = draft.materials.some(item => item.source === 'interview-answer') || Boolean(this.data.session?.turns.length);
    if (!hasConversation) {
      await miniServices().repository.clearRecovery(draft.id).catch(() => undefined);
      miniServices().conversations.clear(draft.id);
      void wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    await miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
    void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}` });
  },

  async composeArticle() {
    const draft = this.data.draft;
    if (!draft?.materials.length) return;
    await miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
    void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}&xiaowen=compose` });
  },

  onHide() {
    miniServices().speech.interrupt();
    speechHold.reset();
    this.setData({ keyboardHeight: 0, voicePressing: false });
    const draft = this.data.draft;
    if (draft && (draft.materials.length || this.data.composer.trim())) void miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
  },

  onUnload() {
    miniServices().speech.interrupt();
    speechHold.reset();
    speechUnsubscribe?.();
    speechUnsubscribe = undefined;
  },
});
