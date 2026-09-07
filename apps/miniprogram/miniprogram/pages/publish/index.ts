import { accountPage } from '../../auth/page';
import { miniServices } from '../../services';
import { MiniPublicationController } from '../../publication/controller';
import { syncPublicationWork } from '../../publication/sync';
import { emptyPublicationDraft, type PublicationDraft } from '../../publication/storage';
import type { OwnSubmission } from '../../publication/client';
import { navigationMetrics } from '../../ui/navigation';
import { aiDisclosureFor, articleText, cloudIdSchema, publicationLabel, type CoverCrops, type PublicationStatus, type PublicationPreview } from '../../domain/core';
import { errorMessage } from '../../ui/error-message';

accountPage({
  services: null as unknown as ReturnType<typeof miniServices>,
  controller: null as unknown as MiniPublicationController,
  unsubscribe: undefined as (() => void) | undefined,
  loaded: false, active: true,
  data: { draft: emptyPublicationDraft('new') as PublicationDraft, status: null as PublicationStatus | null, statusLabel: '',
    preview: null as PublicationPreview | null, mode: 'preview' as 'preview' | 'crop' | 'review' | 'result', submission: null as OwnSubmission | null, aiAssisted: false, windowHeight: 640, navigationHeight: 88, cropKind: 'reading' as 'thumbnail' | 'reading',
    crop: null as CoverCrops['thumbnail'] | null, ratio: 1.25, viewportWidth: 300, cropWidth: 280, title: '', body: '', authorName: '', error: '', busy: '', image: '', thumbnail: '',
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
      if (source === miniServices() && this.active && ['authenticated', 'offline'].includes(source.account.snapshot().status)) {
        render(values, callback);
        if (values.mode) void wx.setNavigationBarColor({ frontColor: values.mode === 'crop' ? '#ffffff' : '#000000', backgroundColor: values.mode === 'crop' ? '#17211c' : '#fbf9f8' });
      }
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
  onUnload() { this.active = false; this.unsubscribe?.(); void wx.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#fbf9f8' }); },
  onResize() { this.resizeContent(); },
  resizeContent() {
    const info = wx.getWindowInfo(), gutter = info.windowWidth <= 370 ? 20 : 24;
    const viewportWidth = info.windowWidth - gutter * 2, { navigationHeight } = navigationMetrics();
    const safe = Math.max(0, (info.screenHeight || info.windowHeight) - (info.safeArea?.bottom ?? info.screenHeight ?? info.windowHeight));
    const available = Math.max(160, info.windowHeight - navigationHeight - safe - 244);
    this.setData({ viewportWidth, windowHeight: info.windowHeight, navigationHeight, cropWidth: Math.min(viewportWidth, available * this.data.ratio) });
  },
  async local() {
    const draft = await this.controller.local();
    if (!this.active || this.services !== miniServices()) return;
    this.setData({ draft, crop: draft.crops?.[this.data.cropKind] ?? null, cropConfirmed: draft.confirmed.includes(this.data.cropKind), thumbnailConfirmed: draft.confirmed.includes('thumbnail'), readingConfirmed: draft.confirmed.includes('reading'), pendingRetry: Boolean(draft.submissionOperation), actionRetry: Boolean(draft.actionOperation) });
  },
  async readWork() {
    const aggregate = await this.services.repository.getAggregate(this.controller.workId);
    if (!aggregate) throw new Error('文章暂时无法读取，请返回我的文章重试。');
    this.setData({ title: aggregate.work.draft.title, body: articleText(aggregate.work.segments),
      aiAssisted: aiDisclosureFor(this.controller.workId, aggregate.session).aiAssisted,
      authorName: this.services.account.snapshot().account?.nickname ?? '', readOnly: false });
  },
  async refresh() {
    if (!this.loaded || this.data.busy || this.data.mode === 'crop') return;
    this.setData({ busy: '正在读取文章…', preview: null, error: '' });
    try {
      await this.local(); await this.readWork();
      await this.services.sync.sync(); await this.readWork();
      const status = await this.services.publications.status(this.controller.workId);
      if (!this.active || this.services !== miniServices()) return;
      let local = await this.controller.local();
      if (!local.dirty && !local.cropBackup && !local.settingOperation && !local.submissionOperation && !local.actionOperation &&
          (local.settingsVersion !== status.settings.version || !local.path)) local = await this.controller.useRemote(status);
      if (local.path && (!local.width || !local.height)) {
        const info = await wx.getImageInfo({ src: local.path }); await this.controller.dimensions(info.width, info.height);
      }
      this.setData({ status, statusLabel: publicationLabel(status), error: '' }); await this.local();
      if (status.pending) { this.setData({ mode: this.data.submitted ? 'result' : 'review' }); await this.readSubmission(); }
      else if (local.cropBackup) { this.setData({ mode: 'crop', image: '' }); this.selectCrop(local.confirmed.includes('reading') ? 'thumbnail' : 'reading'); }
      else { this.setData({ mode: 'preview' }); }
    } catch (error) { this.setData({ error: errorMessage(error, '文章暂时无法读取，请重试。') }); }
    finally { this.setData({ busy: '' }); }
    if (!this.data.error && this.data.mode === 'preview' && this.coverReady()) await this.preparePreview();
  },
  coverReady() { return Boolean(this.data.draft.path && this.data.draft.confirmed.length === 2 && !this.data.draft.cropBackup && !this.data.pendingRetry && !this.data.actionRetry); },
  async readSubmission() {
    const id = this.data.status?.pending?.id ?? this.data.status?.lastSubmission?.id;
    if (!id) return;
    this.setData({ submission: null, image: '' });
    const submission = await this.services.publications.submission(this.controller.workId, id);
    const bytes = await this.services.publications.ownImage(this.controller.workId, submission.assetId, 'reading');
    const image = await this.services.publicationStorage.cacheImage('submitted-' + id, bytes);
    this.setData({ submission, image });
  },
  async showSubmission() {
    this.setData({ mode: 'review', error: '', busy: '正在读取投稿…' });
    try { await this.readSubmission(); } catch (error) { this.setData({ error: errorMessage(error, '投稿暂时无法读取，请重试。') }); }
    finally { this.setData({ busy: '' }); }
    void wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  async coverOptions() {
    if (this.data.busy || this.data.readOnly || this.data.pendingRetry || this.data.actionRetry) return;
    if (!this.data.draft.path) { await this.chooseCover(); return; }
    try {
      const result = await wx.showActionSheet({ itemList: ['调整封面', '更换图片'] });
      if (result.tapIndex === 1) await this.chooseCover(); else await this.openCrop();
    } catch (error) { if (!/cancel/i.test(String((error as { errMsg?: string }).errMsg ?? ''))) this.setData({ error: errorMessage(error, '封面操作暂时无法打开。') }); }
  },
  async openCrop() {
    try { await this.controller.beginCrop(); await this.local(); this.setData({ mode: 'crop', preview: null, error: '' }); this.selectCrop('reading'); }
    catch (error) { this.setData({ error: errorMessage(error, '裁切暂时无法打开。') }); }
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
      await this.local(); this.setData({ mode: 'crop', image: '' }); this.selectCrop('reading');
    } catch (error) {
      if (!/cancel/i.test(String((error as { errMsg?: string }).errMsg ?? ''))) this.setData({ error: errorMessage(error, '封面未保存，请重试。') });
    } finally { this.setData({ busy: '' }); }
  },
  selectCrop(cropKind: 'reading' | 'thumbnail') {
    this.setData({ cropKind, cropConfirmed: this.data.draft.confirmed.includes(cropKind), ratio: cropKind === 'reading' ? 1.25 : 1, crop: this.data.draft.crops?.[cropKind] ?? null }); this.resizeContent();
  },
  changeCropKind(event: WechatMiniprogram.TouchEvent) { this.selectCrop(event.currentTarget.dataset.kind === 'reading' ? 'reading' : 'thumbnail'); },
  async cancelCrop() {
    if (this.data.busy) return;
    this.setData({ busy: '正在恢复封面…' });
    try { await this.controller.cancelCrop(); await this.local(); this.setData({ mode: 'preview', preview: null, image: '', error: '' }); }
    catch (error) { this.setData({ error: errorMessage(error, '原封面尚未恢复，请重试。') }); }
    finally { this.setData({ busy: '' }); }
    if (this.data.mode === 'preview' && this.coverReady()) await this.preparePreview();
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
    this.setData({ busy: '正在确认封面…', error: '' });
    let done = false;
    try {
      await this.controller.confirmCrop(this.data.cropKind); await this.local();
      if (this.data.cropKind === 'reading' && !this.data.thumbnailConfirmed) this.selectCrop('thumbnail');
      else if (!this.data.readingConfirmed) this.selectCrop('reading');
      else { await this.controller.finishCrop(); await this.local(); this.setData({ mode: 'preview', preview: null, image: '' }); done = true; }
    } catch (error) { this.setData({ error: errorMessage(error, '封面未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); }
    if (done) await this.preparePreview();
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
      this.setData({ preview, image, thumbnail, title: preview.title, body: preview.body, aiAssisted: preview.aiAssisted, authorName: preview.authorName, mode: 'preview', error: '' });
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
      this.setData({ submitted: true, mode: 'result', preview: null });
      try { const status = await this.services.publications.status(this.controller.workId); this.setData({ status, statusLabel: publicationLabel(status) }); } catch { this.setData({ notice: '投稿已收到，审核状态稍后更新。' }); }
      void wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) {
      this.setData({ preview: null, error: errorMessage(error, '提交结果尚未确认，请重试。') });
      if ((error as { status?: number }).status === 409) this.setData({ preview: null, mode: 'preview' });
    } finally { this.setData({ busy: '' }); await this.local(); }
  },
  async withdraw(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || !this.data.status) return;
    const action = event.currentTarget.dataset.action === 'withdraw-review' ? 'withdraw-review' : 'withdraw';
    const services = this.services, status = this.data.status;
    this.setData({ busy: '等待确认…', error: '' });
    let withdrawn = false;
    try {
      const result = await wx.showModal({ title: action === 'withdraw-review' ? '撤回审核？' : '撤回发表？',
        content: action === 'withdraw-review' ? '本次投稿将停止审核，您可以修改后重新提交。' : '文章将不再公开，待审核修改也会撤回。私有原稿仍保留。', confirmText: '确认撤回' });
      if (!result.confirm || services !== miniServices() || !this.active) return;
      this.setData({ busy: '正在撤回…' }); await this.controller.withdraw(status, action);
      this.setData({ mode: 'preview', submitted: false, preview: null, submission: null }); withdrawn = true;
    } catch (error) { this.setData({ error: errorMessage(error, '撤回结果尚未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
    if (withdrawn) await this.refresh();
  },
  async retryAction() {
    if (!this.data.status || this.data.busy) return;
    const draft = await this.controller.local();
    if (!draft.actionOperation) return;
    this.setData({ busy: '正在确认撤回…', error: '' });
    try { await this.controller.withdraw(this.data.status, draft.actionOperation.action === 'withdraw-review' ? 'withdraw-review' : 'withdraw'); this.setData({ submitted: false, busy: '' }); await this.refresh(); }
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
      this.setData({ preview: null, image: '', error: '' }); await this.local();
    } catch (error) { this.setData({ error: errorMessage(error, '最新封面未读取，请重试。') }); }
    finally { this.setData({ busy: '' }); }
    if (this.coverReady()) await this.preparePreview();
  },
  editName() { if (!this.data.busy) this.setData({ editingName: true }); },
  closeName() { this.setData({ editingName: false, nameKeyboardHeight: 0 }); },
  nameKeyboard(event: WechatMiniprogram.CustomEvent<{ height: number }>) { this.setData({ nameKeyboardHeight: event.detail.height }); },
  toggleExamples() { this.setData({ showExamples: !this.data.showExamples }); },
  async nameSaved() {
    this.setData({ editingName: false, nameKeyboardHeight: 0, preview: null, authorName: this.services.account.snapshot().account?.nickname ?? '' });
    if (this.data.mode === 'preview' && this.coverReady()) await this.preparePreview();
  },
  settings() { void this.openCrop(); },
  back() { if (this.data.mode === 'crop') void this.cancelCrop(); else if (this.data.mode === 'preview') void this.backToEditor(); else this.myArticles(); },
  async backToEditor() {
    if (!this.loaded) { void wx.navigateBack(); return; }
    await this.services.publicationStorage.flush();
    if (getCurrentPages().at(-2)?.route === 'pages/editor/index') void wx.navigateBack();
    else void wx.redirectTo({ url: '/pages/editor/index?id=' + encodeURIComponent(this.controller.workId) });
  },
  myArticles() { void wx.switchTab({ url: '/pages/profile/index' }); },
  readArticle() { if (this.data.status?.articleId) void wx.navigateTo({ url: '/pages/article/index?id=' + encodeURIComponent(this.data.status.articleId) }); },
  noop() {},
});
