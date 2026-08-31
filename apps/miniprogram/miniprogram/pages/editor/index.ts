import { articleText, emptyDraft, hasContent, splitDraft, type ArticleSession, type Draft } from '../../domain/core';
import { miniServices } from '../../services';

let saveTimer: ReturnType<typeof setTimeout> | undefined;

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
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ xiaowenOpen: Boolean(options.xiaowen) });
    void this.open(typeof options.id === 'string' ? decodeURIComponent(options.id) : undefined);
  },

  async open(id?: string) {
    try {
      const snapshot = await miniServices().repository.load();
      const stored = id ? snapshot.works.find(work => work.id === id && !work.deletedAt) : undefined;
      const useRecovery = snapshot.recovery && (!id || snapshot.recovery.draft.id === id);
      const draft = useRecovery ? snapshot.recovery!.draft : stored?.draft ?? emptyDraft();
      const revision = useRecovery ? snapshot.recovery!.revision : stored?.revision ?? 0;
      const session = useRecovery ? snapshot.recoverySession : snapshot.sessions.find(item => item.workId === draft.id) ?? null;
      miniServices().writer.seed(draft.id, revision);
      this.setData({ draft, session, revision, body: draft.inputMode === 'text' ? draft.textDraft : articleText(draft.segments),
        saved: Boolean(stored) && !useRecovery, error: '', notice: snapshot.issues.map(item => item.message).join(' '),
        topicSources: draft.topicSnapshot?.sources.map(source => ({ id: source.id, title: source.title,
          route: `/pages/source/index?url=${encodeURIComponent(source.url)}&title=${encodeURIComponent(source.title)}` })) ?? [] });
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
    this.setData({ notice: '录音尚未连接到服务端；你可以继续使用文字输入，正文不会丢失。' });
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

  async exportRescue() {
    const draft = this.currentDraft();
    if (!draft) return;
    try { await miniServices().backups.rescue(draft); this.setData({ notice: '已打开救援备份分享。' }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '救援导出失败。' }); }
  },

  openXiaoWen() {
    this.setData({ xiaowenOpen: true, notice: '' });
  },

  closeXiaoWen() { this.setData({ xiaowenOpen: false }); },
  toggleTopic() { this.setData({ topicOpen: !this.data.topicOpen }); },
  onXiaoWenInput(event: WechatMiniprogram.TextareaInput) { this.setData({ xiaowenComposer: event.detail.value }); },
  sendXiaoWen() { this.setData({ error: '小文在线服务尚未建立会话；你的输入仍留在当前页面，没有发送或改动正文。' }); },

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
