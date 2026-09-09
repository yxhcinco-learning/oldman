import { accountPage } from '../../auth/page';
import { miniServices } from '../../services';
import { MiniPublicationController } from '../../publication/controller';
import { syncPublicationWork } from '../../publication/sync';
import { emptyPublicationDraft, type PublicationDraft } from '../../publication/storage';
import type { OwnSubmission } from '../../publication/client';
import { navigationMetrics } from '../../ui/navigation';
import { aiDisclosureFor, articleText, cloudIdSchema, newId, formatTime, publicationLabel, type CoverCrops, type PublicationStatus, type PublicationPreview } from '../../domain/core';
import { errorMessage } from '../../ui/error-message';
import { compositionCrops, validCrop } from '../../publication/crop';

accountPage({
  services: null as unknown as ReturnType<typeof miniServices>,
  controller: null as unknown as MiniPublicationController,
  unsubscribe: undefined as (() => void) | undefined,
  loaded: false, active: true,
  cropSave: null as Promise<void> | null,
  data: { draft: emptyPublicationDraft('new') as PublicationDraft, status: null as PublicationStatus | null, statusLabel: '',
    preview: null as PublicationPreview | null, mode: 'settings' as 'settings' | 'preview' | 'crop' | 'review' | 'result', submission: null as OwnSubmission | null, aiAssisted: false, windowHeight: 640, navigationHeight: 88,
    crop: null as CoverCrops['thumbnail'] | null, ratio: 1.25, viewportWidth: 300, cropWidth: 280, title: '', body: '', wordCount: 0, authorName: '', error: '', coverError: '', busy: '', image: '', submissionId: '', submissionDate: '',
    cropPreviews: null as CoverCrops | null, thumbnailConfirmed: false, readingConfirmed: false, nameKeyboardHeight: 0,
    audience: 'account' as 'account' | 'guest', audiencePending: false, editingName: false, submitted: false, pendingRetry: false, actionRetry: false, readOnly: false, notice: '' },
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
      () => { if (source !== miniServices() || !this.active) throw new Error('账号或页面已变化，请重新打开文章。'); }, () => this.saveAudience());
    this.resizeContent();
    this.unsubscribe = source.account.subscribe(state => {
      if (source !== miniServices() || !['authenticated', 'offline'].includes(state.status)) render({ ...blank, readOnly: true });
    });
    this.loaded = true;
  },
  async onShow() { this.active = true; if (this.loaded && !this.data.busy && !(this.data.mode === 'preview' && this.data.preview)) await this.refresh(); },
  onHide() { /* Selecting a photo may hide this page; keep its account-bound persistence active. */ },
  onUnload() { this.active = false; this.unsubscribe?.(); void wx.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#fbf9f8' }); },
  onResize() { this.resizeContent(); },
  resizeContent() {
    const info = wx.getWindowInfo(), gutter = info.windowWidth <= 370 ? 20 : 24;
    const viewportWidth = info.windowWidth - gutter * 2, { navigationHeight } = navigationMetrics();
    const safe = Math.max(0, (info.screenHeight || info.windowHeight) - (info.safeArea?.bottom ?? info.screenHeight ?? info.windowHeight));
    const available = Math.max(140, info.windowHeight - navigationHeight - safe - 312);
    this.setData({ viewportWidth, windowHeight: info.windowHeight, navigationHeight,
      cropWidth: Math.min(viewportWidth, info.windowHeight * .32 * 1.25, available * 1.25) });
  },
  async local() {
    const draft = await this.controller.local();
    if (!this.active || this.services !== miniServices()) return;
    this.setData({ draft, audience: draft.audienceChoice ?? this.data.status?.audience ?? 'account', audiencePending: Boolean(draft.audienceOperation), crop: draft.crops?.reading ?? null, cropPreviews: draft.crops, thumbnailConfirmed: draft.confirmed.includes('thumbnail'), readingConfirmed: draft.confirmed.includes('reading'), pendingRetry: Boolean(draft.submissionOperation), actionRetry: Boolean(draft.actionOperation) });
  },
  async readWork() {
    const aggregate = await this.services.repository.getAggregate(this.controller.workId);
    if (!aggregate) throw new Error('文章暂时无法读取，请返回我的文章重试。');
    const body = articleText(aggregate.work.segments);
    this.setData({ title: aggregate.work.draft.title, body, wordCount: body.replace(/\s/g, '').length,
      aiAssisted: aiDisclosureFor(this.controller.workId, aggregate.session).aiAssisted,
      authorName: this.services.account.snapshot().account?.nickname ?? '', readOnly: false });
  },
  async refresh() {
    if (!this.loaded || this.data.busy || this.data.mode === 'crop') return;
    this.setData({ busy: '正在读取文章…', preview: null, error: '' });
    try {
      await this.local(); await this.readWork();
      await Promise.all([this.services.sync.sync(), this.services.account.refresh()]); await this.readWork();
      const status = await this.services.publications.status(this.controller.workId);
      if (!this.active || this.services !== miniServices()) return;
      let local = await this.controller.local();
      if (!local.dirty && !local.cropBackup && !local.settingOperation && !local.submissionOperation && !local.actionOperation &&
          (local.settingsVersion !== status.settings.version || !local.path)) local = await this.controller.useRemote(status);
      if (local.path && (!local.width || !local.height)) {
        const info = await wx.getImageInfo({ src: local.path }); await this.controller.dimensions(info.width, info.height);
      }
      this.setData({ status, statusLabel: publicationLabel(status), error: '' }); await this.local();
      if (status.pending) { this.setData({ mode: this.data.submitted ? 'result' : 'review' }); await this.readSubmission(status.pending.id); }
      else if (local.cropBackup) { await this.controller.beginCrop(); await this.local(); this.setData({ mode: 'crop', image: '' }); this.resizeContent(); }
      else { this.setData({ mode: 'settings' }); }
    } catch (error) { this.setData({ error: errorMessage(error, '文章暂时无法读取，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  validateSettings() {
    if (!this.data.title.trim() || !this.data.body.trim()) { this.setData({ error: '请返回编辑页补全标题和正文。' }); return false; }
    if (!this.coverReady()) { this.setData({ coverError: this.data.draft.path ? '请先完成封面调整。' : '请先添加封面。' }); return false; }
    if (!this.data.authorName.trim()) { this.setData({ error: '请先填写署名。' }); return false; }
    this.setData({ coverError: '' }); return true;
  },
  retry() {
    if (this.data.mode === 'preview') void this.preparePreview();
    else if (this.data.mode === 'review' || this.data.mode === 'result') void this.showSubmission();
    else void this.refresh();
  },
  async explainAi() {
    try { await wx.showModal({ title: '创作方式', content: '这篇文章使用过小文的 AI 辅助整理。发表后，读者会看到相应标识。', showCancel: false, confirmText: '知道了' }); }
    catch { this.setData({ error: '说明暂时无法打开，请重试。' }); }
  },
  coverReady() { return Boolean(this.data.draft.path && this.data.draft.confirmed.length === 2 && !this.data.draft.cropBackup && !this.data.pendingRetry && !this.data.actionRetry); },
  async readSubmission(submissionId?: string) {
    const id = submissionId || this.data.submissionId || this.data.status?.pending?.id || this.data.status?.lastSubmission?.id;
    if (!id) return;
    this.setData({ submission: null, image: '' });
    const submission = await this.services.publications.submission(this.controller.workId, id);
    if (!this.active || this.services !== miniServices()) return;
    const bytes = await this.services.publications.ownImage(this.controller.workId, submission.assetId, 'reading');
    if (!this.active || this.services !== miniServices()) return;
    const image = await this.services.publicationStorage.cacheImage('submitted-' + id, bytes);
    this.setData({ submission, image, submissionId: id, submissionDate: formatTime(submission.createdAt) });
  },
  async showSubmission() {
    if (this.data.busy || this.data.readOnly) return;
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
    if (this.data.busy || this.data.readOnly || !this.active || this.services !== miniServices()) return;
    try { await this.controller.beginCrop(); await this.local(); this.setData({ mode: 'crop', preview: null, error: '' }); this.resizeContent(); }
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
      await this.local(); this.setData({ mode: 'crop', image: '' }); this.resizeContent();
    } catch (error) {
      if (!/cancel/i.test(String((error as { errMsg?: string }).errMsg ?? ''))) this.setData({ error: errorMessage(error, '封面未保存，请重试。') });
    } finally { this.setData({ busy: '' }); }
  },
  async cancelCrop() {
    if (this.data.busy) return;
    this.setData({ busy: '正在恢复封面…' });
    try { await this.cropSave; await this.controller.cancelCrop(); await this.local(); this.setData({ mode: 'settings', preview: null, image: '', error: '', coverError: '' }); }
    catch (error) { this.setData({ error: errorMessage(error, '原封面尚未恢复，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  cropChanging(event: WechatMiniprogram.CustomEvent<{ crop: CoverCrops['reading'] }>) {
    if (this.data.mode !== 'crop' || this.data.busy || this.data.readOnly || !this.active || this.services !== miniServices() || !validCrop(event.detail.crop)) return;
    this.setData({ crop: event.detail.crop, cropPreviews: compositionCrops(event.detail.crop), preview: null });
  },
  async cropChanged(event: WechatMiniprogram.CustomEvent<{ crop: CoverCrops['reading'] }>) {
    if (this.data.mode !== 'crop' || this.data.busy || this.data.readOnly || !this.active || this.services !== miniServices() || !validCrop(event.detail.crop)) return;
    this.cropChanging(event);
    const crop = { ...event.detail.crop };
    // Keep gesture-end writes in order; live previews do not wait for disk.
    this.cropSave = (this.cropSave ?? Promise.resolve()).then(async () => { await this.controller.compose(crop); })
      .catch(error => { this.setData({ error: errorMessage(error, '裁切未保存，请重试。') }); });
    await this.cropSave;
  },
  async confirmCrop() {
    if (this.data.busy || this.data.readOnly || this.data.mode !== 'crop' || !this.data.crop) return;
    this.setData({ busy: '正在确认封面…', error: '' });
    try {
      await this.cropSave; await this.controller.compose(this.data.crop); await this.controller.finishCrop(); await this.local();
      this.setData({ mode: 'settings', preview: null, image: '', coverError: '' });
    } catch (error) { this.setData({ error: errorMessage(error, '封面未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  async preparePreview() {
    if (this.data.busy || this.data.readOnly || !this.validateSettings()) return;
    this.setData({ busy: '正在准备预览…', error: '', notice: '' });
    try {
      const preview = await this.controller.prepare();
      if (!this.active || this.services !== miniServices()) return;
      const reading = await this.services.publications.ownImage(this.controller.workId, preview.assetId, 'reading');
      if (!this.active || this.services !== miniServices()) return;
      const image = await this.services.publicationStorage.cacheImage('preview-' + preview.assetId, reading);
      if (!this.active || this.services !== miniServices()) return;
      this.setData({ preview, image, mode: 'preview', error: '' });
      void wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) { if (this.active) this.setData({ preview: null, error: errorMessage(error, '预览未完成，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
  },
  async submit() {
    if (this.data.busy || this.data.readOnly || this.data.mode === 'preview' || (!this.data.pendingRetry && !this.validateSettings())) return;
    this.setData({ busy: '正在提交…', error: '' });
    try {
      const receipt = await this.controller.submit(this.data.authorName);
      if (!this.active || this.services !== miniServices()) return;
      this.setData({ submitted: true, mode: 'result', preview: null, submission: null, submissionId: receipt.submissionId, notice: '' });
      try { await this.readSubmission(receipt.submissionId); } catch { this.setData({ notice: '投稿已收到，可稍后查看本次投稿。' }); }
      try { const status = await this.services.publications.status(this.controller.workId); this.setData({ status, statusLabel: publicationLabel(status) }); } catch { this.setData({ notice: '投稿已收到，审核状态稍后更新。' }); }
      void wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) {
      this.setData({ preview: null, error: errorMessage(error, '提交结果尚未确认，请重试。') });
      if ((error as { status?: number }).status === 409) this.setData({ preview: null, mode: 'settings' });
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
      this.setData({ mode: 'settings', submitted: false, preview: null, submission: null, submissionId: '' }); withdrawn = true;
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
    if (this.data.busy || this.data.readOnly || this.data.pendingRetry || this.data.actionRetry) return;
    this.setData({ busy: '等待确认…' });
    try {
      const result = await wx.showModal({ title: '使用最新封面？', content: '将以已保存到账号的封面和裁切继续，本机原图仍保留。', confirmText: '使用最新' });
      if (!result.confirm || !this.active || this.services !== miniServices()) return;
      this.setData({ busy: '正在读取…' });
      // A confirmed conflict is safe to abandon; unknown outcomes must first retry the same operation.
      const draft = await this.controller.local();
      if (draft.settingOperation) {
        try { await this.services.publications.settings(this.controller.workId, draft.settingOperation); }
        catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
        if (!this.active || this.services !== miniServices()) return;
        await this.services.publicationStorage.save({ ...draft, settingOperation: null });
      }
      const status = await this.services.publications.status(this.controller.workId);
      await this.controller.useRemote(status);
      const latest = await this.controller.local();
      if (latest.path) { const info = await wx.getImageInfo({ src: latest.path }); await this.controller.dimensions(info.width, info.height); }
      this.setData({ preview: null, image: '', error: '' }); await this.local();
    } catch (error) { this.setData({ error: errorMessage(error, '最新封面未读取，请重试。') }); }
    finally { this.setData({ busy: '' }); }
  },
  async chooseAudience() {
    if (this.data.busy || this.data.readOnly || this.data.pendingRetry || this.data.audiencePending) return;
    const audience = this.data.audience === 'guest' ? 'account' : 'guest';
    const result = await wx.showModal({ title: audience === 'guest' ? '允许未登录用户阅读？' : '关闭游客阅读？', content: audience === 'guest' ? (this.data.status?.published ? '这篇已发表文章将立即允许未登录用户阅读正文、封面与已通过的评论，不必等待修改稿审核。微信已缓存的好友卡片无法回收。' : '审核通过后，未登录用户也可以阅读这篇文章及封面、已通过的评论。微信已缓存的好友卡片无法回收。') : '未登录用户将无法继续读取正文、封面和评论；已缓存的微信卡片无法回收。', confirmText: audience === 'guest' ? '允许阅读' : '确认关闭' });
    if (!result.confirm || !this.active || this.services !== miniServices()) return;
    this.setData({ busy: '正在保存阅读范围…', error: '' });
    try {
      const draft = await this.controller.local();
      await this.services.publicationStorage.save({ ...draft, audienceChoice: audience }); await this.local();
      if (this.data.status?.articleId) await this.saveAudience();
    } catch (error) { this.setData({ error: errorMessage(error, '阅读范围尚未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
  },
  async saveAudience() {
    let draft = await this.controller.local();
    if (draft.audienceChoice === null && !draft.audienceOperation) return;
    const status = await this.services.publications.status(this.controller.workId);
    if (!this.active || this.services !== miniServices()) throw new Error('账号或页面已变化，请重新打开。');
    if (!draft.audienceOperation && draft.audienceChoice === (status.audience ?? 'account')) { await this.services.publicationStorage.save({ ...draft, audienceChoice: null }); this.setData({ status, audience: status.audience ?? 'account' }); return; }
    draft = { ...draft, audienceOperation: draft.audienceOperation ?? { operationId: newId(), expectedVersion: status.audienceVersion ?? 0, audience: draft.audienceChoice!, consentVersion: 'guest-reading-v1' } };
    await this.services.publicationStorage.save(draft);
    try {
      const result = await this.services.social.audience(this.controller.workId, draft.audienceOperation!);
      if (!this.active || this.services !== miniServices()) return;
      await this.services.publicationStorage.save({ ...draft, audienceChoice: null, audienceOperation: null });
      this.setData({ status: { ...status, ...result }, audience: result.audience, audiencePending: false });
    } catch (error) {
      if ((error as { status?: number }).status === 409) await this.services.publicationStorage.save({ ...draft, audienceOperation: null });
      throw error;
    }
  },
  async retryAudience() {
    if (this.data.busy) return;
    this.setData({ busy: '正在核对阅读范围…', error: '' });
    try { await this.saveAudience(); } catch (error) { this.setData({ error: errorMessage(error, '阅读范围尚未确认，请重试。') }); }
    finally { this.setData({ busy: '' }); await this.local(); }
  },
  editName() { if (!this.data.busy && !this.data.readOnly && !this.data.pendingRetry && !this.data.actionRetry) this.setData({ editingName: true }); },
  closeName() { this.setData({ editingName: false, nameKeyboardHeight: 0 }); },
  nameKeyboard(event: WechatMiniprogram.CustomEvent<{ height: number }>) { this.setData({ nameKeyboardHeight: event.detail.height }); },
  async nameSaved() {
    this.setData({ editingName: false, nameKeyboardHeight: 0, preview: null, authorName: this.services.account.snapshot().account?.nickname ?? '' });
  },
  settings() { void this.openCrop(); },
  back() {
    if (this.data.busy) return;
    if (this.data.mode === 'crop') void this.cancelCrop();
    else if (this.data.mode === 'preview') { this.setData({ mode: 'settings', preview: null, error: '' }); void wx.pageScrollTo({ scrollTop: 0, duration: 0 }); }
    else if (this.data.mode === 'settings') void this.backToEditor();
    else this.myArticles();
  },
  async backToEditor() {
    if (!this.loaded) { void wx.navigateBack(); return; }
    try { await this.services.publicationStorage.flush(); }
    catch (error) { this.setData({ error: errorMessage(error, '发表设置尚未保存，请重试。') }); return; }
    if (!this.active || this.services !== miniServices()) return;
    if (getCurrentPages().at(-2)?.route === 'pages/editor/index') void wx.navigateBack();
    else void wx.redirectTo({ url: '/pages/editor/index?id=' + encodeURIComponent(this.controller.workId) });
  },
  myArticles() { void wx.switchTab({ url: '/pages/profile/index' }); },
  readArticle() { if (this.data.status?.articleId) void wx.navigateTo({ url: '/pages/article/index?id=' + encodeURIComponent(this.data.status.articleId) }); },
  noop() {},
});
