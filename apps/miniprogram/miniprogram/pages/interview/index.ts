import { newId, newSession, type ArticleSession, type Draft, type WritingMaterial } from '../../domain/core';
import { interviewMessages, interviewQuestion, type InterviewMessage } from '../../interview/flow';
import { miniServices } from '../../services';

Page({
  data: {
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
  },

  onLoad(options: Record<string, string | undefined>) {
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
    if (!draft || !answer || this.data.saving) return;
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

  dictateUnavailable() {
    this.setData({ error: '语音输入尚未配置，请继续使用文字回答。语音转写以后也只会放进输入框，不会自动发送。' });
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
    const draft = this.data.draft;
    if (draft && (draft.materials.length || this.data.composer.trim())) void miniServices().writer.preserve(draft, this.data.session ?? undefined).catch(() => undefined);
  },
});
