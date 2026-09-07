import { accountPage } from '../../auth/page';
import { miniServices } from '../../services';
import { MiniPublicationController } from '../../publication/controller';
import { syncPublicationWork } from '../../publication/sync';
import { emptyPublicationDraft, type PublicationDraft } from '../../publication/storage';
import { articleText, cloudIdSchema, publicationLabel, type CoverCrops, type PublicationStatus, type PublicationPreview } from '../../domain/core';
import { errorMessage } from '../../ui/error-message';

accountPage({
  services: null as unknown as ReturnType<typeof miniServices>,
  controller: null as unknown as MiniPublicationController,
  unsubscribe: undefined as (() => void) | undefined,
  loaded: false, active: true,
  data: { draft: emptyPublicationDraft('new') as PublicationDraft, status: null as PublicationStatus | null, statusLabel: '',
    preview: null as PublicationPreview | null, mode: 'settings' as 'settings' | 'preview' | 'result', cropKind: 'thumbnail' as 'thumbnail' | 'reading',
    crop: null as CoverCrops['thumbnail'] | null, ratio: 1, viewportWidth: 300, cropWidth: 280, title: '', body: '', authorName: '', error: '', busy: '', image: '', thumbnail: '',
    cropConfirmed: false, thumbnailConfirmed: false, readingConfirmed: false, showExamples: false, nameKeyboardHeight: 0,
    editingName: false, submitted: false, pendingRetry: false, actionRetry: false, readOnly: false, notice: '' },
  async onLoad(options: Record<string, string | undefined>) {
    const parsed = cloudIdSchema.safeParse(options.id);
    if (!parsed.success) { this.setData({ error: '文章地址无效。', readOnly: true }); return; }
    this.services = miniServices();
    const source = this.services;
    const blank = { ...this.data };
    const render = this.setData.bind(this);
    this.setData = (values, callback) => {
      if (source === miniServices() && this.active && ['authenticated', 'offline'].includes(source.account.snapshot().status)) render(values, callback);
    };
    this.controller = new MiniPublicationController(parsed.data, source.publicationStorage, source.publications,
      () => syncPublicationWork(parsed.data, source.repository, () => source.sync.sync()),
      () => { if (source !== miniServices() || !this.active) throw new Error('账号或页面已变化，请重新打开文章。'); });
    this.resizeContent();
    this.unsubscribe = source.account.subscribe(state => {
      if (source !== miniServices() || !['authenticated', 'offline'].includes(state.status)) render({ ...blank, readOnly: true });
    });
    this.loaded = true;
  },
  async onShow() { this.active = true; if (this.loaded && !this.data.busy) await this.refresh(); },
  onHide() { /* Selecting a photo may hide this page; keep its account-bound persistence active. */ },
  onUnload() { this.active = false; this.unsubscribe?.(); },
  onResize() { this.resizeContent(); },
  resizeContent() {
    const info = wx.getWindowInfo(), gutter = info.windowWidth <= 370 ? 20 : 24;
    const viewportWidth = info.windowWidth - gutter * 2;
    this.setData({ viewportWidth, cropWidth: Math.min(viewportWidth, Math.max(200, Math.floor((info.windowHeight || 640) * .38))) });
  },
  async local() {
    const draft = await this.controller.local();
    if (!this.active || this.services !== miniServices()) return;
    this.setData({ draft, crop: draft.crops?.[this.data.cropKind] ?? null, cropConfirmed: draft.confirmed.includes(this.data.cropKind), thumbnailConfirmed: draft.confirmed.includes('thumbnail'), readingConfirmed: draft.confirmed.includes('reading'), pendingRetry: Boolean(draft.submissionOperation), actionRetry: Boolean(draft.actionOperation) });
  },
  async refresh() {
    try {
      this.setData({ preview: null, mode: this.data.status?.pending || this.data.submitted ? 'result' : 'settings' });
      await this.local();
      const aggregate = await this.services.repository.getAggregate(this.controller.workId);
      if (!aggregate) throw new Error('文章暂时无法读取，请返回我的文章重试。');
      if (!this.active || this.services !== miniServices()) return;
      this.setData({ title: aggregate.work.draft.title, body: articleText(aggregate.work.segments), authorName: this.services.account.snapshot().account?.nickname ?? '', readOnly: false });
      await this.services.sync.sync();
      const status = await this.services.publications.status(this.controller.workId);
      if (!this.active || this.services !== miniServices()) return;
      let local = await this.controller.local();
      if (!local.dirty && !local.settingOperation && !local.submissionOperation && !local.actionOperation &&
          (local.settingsVersion !== status.settings.version || !local.path)) local = await this.controller.useRemote(status);
      if (local.path && (!local.width || !local.height)) {
        const info = await wx.getImageInfo({ src: local.path });
        await this.controller.dimensions(info.width, info.height);
      }
      this.setData({ status, statusLabel: publicationLabel(status), mode: status.pending || (this.data.submitted && status.published) ? 'result' : 'settings', error: '', authorName: this.services.account.snapshot().account?.nickname ?? '' });
      await this.local();
    } catch (error) { if (this.active) this.setData({ error: errorMessage(error, '发表设置暂时无法读取。') }); }
  },
  async chooseCover() {
    if (this.data.busy || this.data.readOnly) return;
    this.setData({ busy: '正在选择封面…', error: '' });
    try {
      const selected = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
      if (!this.active || this.services !== miniServices()) return;
      const file = selected.tempFiles[0];
      if (!file) return;
      this.setData({ busy: '正在保留封面…', error: '', preview: null });
      const info = await wx.getImageInfo({ src: file.tempFilePath });
      const rotated = /^(left|right)/.test(info.orientation);
      await this.controller.choose(file.tempFilePath, rotated ? info.height : info.width, rotated ? info.width : info.height);
      await this.local();
    } catch (error) {
      if (!/cancel/i.test(String((error as { errMsg?: string }).errMsg ?? ''))) this.setData({ error: errorMessage(error, '封面未保存，请重试。') });
    } finally { this.setData({ busy: '' }); }
  },
  changeCropKind(event: WechatMiniprogram.TouchEvent) {
    const cropKind = event.currentTarget.dataset.kind === 'reading' ? 'reading' : 'thumbnail';
    this.setData({ cropKind, cropConfirmed: this.data.draft.confirmed.includes(cropKind), ratio: cropKind === 'reading' ? 1.25 : 1, crop: this.data.draft.crops?.[cropKind] ?? null });
  },
  async cropChanged(event: WechatMiniprogram.CustomEvent<{ crop: CoverCrops['thumbnail'] }>) {
    if (this.data.busy || !this.data.draft.crops) return;
    this.setData({ busy: '正在保留裁切…', preview: null });
    try { await this.controller.crop({ ...this.data.draft.crops, [this.data.cropKind]: event.detail.crop }); await this.local(); }
    catch (error) { this.setData({ error: errorMessage(error, '裁切未保存，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  async confirmCrop() {
    if (this.data.busy || this.data.readOnly) return;
    this.setData({ busy: '正在确认裁切…' });
    try { await this.controller.confirmCrop(this.data.cropKind); await this.local(); }
    catch (error) { this.setData({ error: errorMessage(error, '裁切确认失败。') }); }
    finally { this.setData({ busy: '' }); }
  },
  async preparePreview() {
    if (this.data.busy || this.data.readOnly) return;
    this.setData({ busy: '正在准备预览…', error: '', notice: '' });
    try {
      const preview = await this.controller.prepare();
      const reading = await this.services.publications.ownImage(this.controller.workId, preview.assetId, 'reading');
      const image = await this.services.publicationStorage.cacheImage('preview-' + preview.assetId, reading);
      const thumb = await this.services.publications.ownImage(this.controller.workId, preview.assetId, 'thumbnail');
      const thumbnail = await this.services.publicationStorage.cacheImage('thumb-' + preview.assetId, thumb);
      if (!this.active || this.services !== miniServices()) return;
      this.setData({ preview, image, thumbnail, authorName: preview.authorName, mode: 'preview', showExamples: false, error: '' });
      void wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) { if (this.active) this.setData({ preview: null, error: errorMessage(error, '预览未完成，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
  },
  async submit() {
    if (this.data.busy || this.data.readOnly) return;
    this.setData({ busy: '正在提交…', error: '' });
    try {
      await this.controller.submit(this.data.preview);
      if (!this.active || this.services !== miniServices()) return;
      const status = await this.services.publications.status(this.controller.workId);
      this.setData({ status, statusLabel: publicationLabel(status), submitted: true, mode: 'result', preview: null });
      void wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) {
      this.setData({ error: errorMessage(error, '提交结果尚未确认，请重试。') });
      if ((error as { status?: number }).status === 409) this.setData({ preview: null, mode: 'settings' });
    } finally { this.setData({ busy: '' }); await this.local(); }
  },
  async withdraw(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || !this.data.status) return;
    const action = event.currentTarget.dataset.action === 'withdraw-review' ? 'withdraw-review' : 'withdraw';
    const result = await wx.showModal({ title: action === 'withdraw-review' ? '撤回审核？' : '撤回发表？',
      content: action === 'withdraw-review' ? '本次投稿将停止审核，您可以修改后重新提交。' : '文章将不再公开，待审核修改也会撤回。私有原稿仍保留。', confirmText: '确认撤回' });
    if (!result.confirm) return;
    this.setData({ busy: '正在撤回…', error: '' });
    try { await this.controller.withdraw(this.data.status, action); this.setData({ mode: 'settings', submitted: false, preview: null }); await this.refresh(); }
    catch (error) { this.setData({ error: errorMessage(error, '撤回结果尚未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
  },
  async retryAction() {
    if (!this.data.status || this.data.busy) return;
    const draft = await this.controller.local();
    if (!draft.actionOperation) return;
    this.setData({ busy: '正在确认撤回…', error: '' });
    try { await this.controller.withdraw(this.data.status, draft.actionOperation.action === 'withdraw-review' ? 'withdraw-review' : 'withdraw'); await this.refresh(); }
    catch (error) { this.setData({ error: errorMessage(error, '撤回结果尚未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
  },
  async useLatestCover() {
    if (this.data.busy) return;
    const result = await wx.showModal({ title: '使用最新封面？', content: '将以已保存到账号的封面和裁切继续，本机原图仍保留。', confirmText: '使用最新' });
    if (!result.confirm) return;
    this.setData({ busy: '正在读取…' });
    try {
      // A confirmed conflict is safe to abandon; unknown outcomes must first retry the same operation.
      const draft = await this.controller.local();
      if (draft.settingOperation) {
        try { await this.services.publications.settings(this.controller.workId, draft.settingOperation); }
        catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
        await this.services.publicationStorage.save({ ...draft, settingOperation: null });
      }
      const status = await this.services.publications.status(this.controller.workId);
      await this.controller.useRemote(status);
      const latest = await this.controller.local();
      if (latest.path) { const info = await wx.getImageInfo({ src: latest.path }); await this.controller.dimensions(info.width, info.height); }
      this.setData({ preview: null, error: '' }); await this.local();
    } catch (error) { this.setData({ error: errorMessage(error, '最新封面未读取，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  editName() { if (!this.data.busy) this.setData({ editingName: true }); },
  closeName() { this.setData({ editingName: false, nameKeyboardHeight: 0 }); },
  nameKeyboard(event: WechatMiniprogram.CustomEvent<{ height: number }>) { this.setData({ nameKeyboardHeight: event.detail.height }); },
  toggleExamples() { this.setData({ showExamples: !this.data.showExamples }); },
  async nameSaved() {
    this.setData({ editingName: false, nameKeyboardHeight: 0, preview: null, authorName: this.services.account.snapshot().account?.nickname ?? '' });
    if (this.data.mode === 'preview') await this.preparePreview();
  },
  settings() { this.setData({ mode: 'settings', preview: null }); void wx.pageScrollTo({ scrollTop: 0, duration: 0 }); },
  async backToEditor() {
    if (!this.loaded) { void wx.navigateBack(); return; }
    await this.services.publicationStorage.flush();
    if (getCurrentPages().at(-2)?.route === 'pages/editor/index') void wx.navigateBack();
    else void wx.redirectTo({ url: '/pages/editor/index?id=' + encodeURIComponent(this.controller.workId) });
  },
  myArticles() { void wx.redirectTo({ url: '/pages/works/index' }); },
  readArticle() { if (this.data.status?.articleId) void wx.navigateTo({ url: '/pages/article/index?id=' + encodeURIComponent(this.data.status.articleId) }); },
  noop() {},
});
