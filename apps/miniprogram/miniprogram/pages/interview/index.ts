import { newId, newSession, type ArticleSession, type Draft, type WritingMaterial } from '../../domain/core';
import { miniServices } from '../../services';

interface Message { id: string; role: 'assistant' | 'user'; text: string }

Page({
  data: {
    draft: null as Draft | null,
    session: null as ArticleSession | null,
    revision: 0,
    messages: [] as Message[],
    question: '第一次见面，先简单介绍一下自己吧。怎么称呼您，过去主要做什么？',
    questionIndex: -1,
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
      const messages: Message[] = [{ id: 'intro', role: 'assistant', text: '我是小文，会一次问一个问题。您的回答先保存在这篇文章的本机素材里，整理结果也要由您确认后才会进入正文。' }];
      for (const material of answers) messages.push({ id: material.id, role: 'user', text: material.text });
      const questionIndex = Math.max(-1, answers.length - 1);
      const question = answers.length ? draft.topicSnapshot.starterQuestion : this.data.question;
      this.setData({ draft, session, revision, messages, questionIndex, question, error: snapshot.issues.map(item => item.message).join(' ') });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '采访暂时无法打开。' });
    }
  },

  onComposer(event: WechatMiniprogram.TextareaInput) {
    this.setData({ composer: event.detail.value, error: '' });
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
      const questionIndex = this.data.questionIndex + 1;
      const prompts = next.topicSnapshot?.angles.map(angle => angle.prompt) ?? [];
      const question = questionIndex === 0 ? next.topicSnapshot!.starterQuestion
        : prompts[questionIndex % Math.max(1, prompts.length)] ?? '这段经历里，您最想保留的一个细节是什么？';
      this.setData({ draft: next, session, revision: work?.revision ?? this.data.revision, composer: '', saving: false, questionIndex, question,
        messages: [...this.data.messages, { id: material.id, role: 'user', text: answer }] });
    } catch (error) {
      this.setData({ saving: false, error: error instanceof Error ? error.message : '回答尚未保存，请重试。' });
    }
  },

  changeQuestion() {
    const topic = this.data.draft?.topicSnapshot;
    if (!topic) return;
    const nextIndex = this.data.questionIndex + 1;
    const prompt = topic.angles[nextIndex % topic.angles.length]?.prompt ?? topic.starterQuestion;
    this.setData({ questionIndex: nextIndex, question: prompt });
  },

  dictateUnavailable() {
    this.setData({ error: '语音输入尚未配置，请继续使用文字回答。' });
  },

  async closeInterview() {
    const draft = this.data.draft;
    if (!draft) { void wx.reLaunch({ url: '/pages/home/index' }); return; }
    const hasConversation = draft.materials.length > 0 || Boolean(this.data.composer.trim());
    if (!hasConversation) {
      await miniServices().repository.clearRecovery(draft.id).catch(() => undefined);
      void wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    const pending = this.data.composer.trim() ? { ...draft, materials: [...draft.materials, { id: newId(), source: 'user-note' as const,
      text: this.data.composer.trim(), createdAt: new Date().toISOString(), selected: true }] } : draft;
    await miniServices().writer.preserve(pending, this.data.session ?? undefined).catch(() => undefined);
    void wx.redirectTo({ url: `/pages/editor/index?id=${encodeURIComponent(draft.id)}&xiaowen=1` });
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
