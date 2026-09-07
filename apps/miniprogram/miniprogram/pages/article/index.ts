import { accountPage } from '../../auth/page';
import { miniServices } from '../../services';
import { cloudIdSchema, type PublicArticle } from '../../domain/core';
import { errorMessage } from '../../ui/error-message';
accountPage({
  id: '', sequence: 0, active: true, unsubscribe: undefined as (() => void) | undefined,
  sharePayload: null as { title: string; path: string; imageUrl: string } | null,
  data: { coverHeight: 250, article: null as PublicArticle | null, image: '', loading: false, error: '', date: '', shareReady: false, ownerWorkId: '' },
  onLoad(options: Record<string, string | undefined>) {
    const parsed = cloudIdSchema.safeParse(options.id); this.id = parsed.success ? parsed.data : '';
    this.resizeContent();
    const source = miniServices();
    this.unsubscribe = source.account.subscribe(state => {
      if (source !== miniServices() || !['authenticated', 'offline'].includes(state.status)) {
        this.sharePayload = null; this.sequence++; this.setData({ article: null, image: '', shareReady: false, ownerWorkId: '' }); void wx.hideShareMenu();
      }
    });
  },
  async onShow() { this.active = true; await this.refresh(); },
  onHide() { this.active = false; this.sequence++; this.setData({ article: null, image: '', shareReady: false }); void wx.hideShareMenu(); },
  onUnload() { this.active = false; this.sequence++; this.unsubscribe?.(); },
  onResize() { this.resizeContent(); },
  resizeContent() { const width = wx.getWindowInfo().windowWidth; this.setData({ coverHeight: (width - (width <= 370 ? 40 : 48)) * 0.8 }); },
  async refresh(retry = false) {
    this.sharePayload = null;
    const sequence = ++this.sequence, services = miniServices();
    this.setData({ article: null, image: '', shareReady: false, ownerWorkId: '', error: '', loading: true });
    void wx.hideShareMenu();
    try {
      if (!this.id) throw new Error('这篇文章暂时无法查看。');
      const article = await services.publications.article(this.id);
      const bytes = await services.publications.image(this.id, 'reading');
      if (!this.active || sequence !== this.sequence || services !== miniServices()) return;
      const image = await services.publicationStorage.cacheImage('article-' + article.id + '-' + article.version, bytes);
      // Verify again after asynchronous image IO so a withdrawn article is not installed late.
      const latest = await services.publications.article(this.id);
      if (!this.active || sequence !== this.sequence || services !== miniServices()) return;
      if (latest.version !== article.version) { if (retry) throw new Error('文章正在更新，请稍后重试。'); await this.refresh(true); return; }
      this.sharePayload = { title: article.title, path: '/pages/article/index?id=' + encodeURIComponent(article.id), imageUrl: image };
      this.setData({ article, image, shareReady: true, date: article.publishedAt.slice(0, 10) });
      await wx.showShareMenu({ menus: ['shareAppMessage'] });
      try {
        const statuses = await services.publications.statuses();
        if (this.active && sequence === this.sequence && services === miniServices()) this.setData({ ownerWorkId: statuses.publications.find(s => s.articleId === this.id && s.published)?.workId ?? '' });
      } catch { /* Author controls require verified ownership; reading remains available. */ }
    } catch (error) { if (this.active && sequence === this.sequence) this.setData({ article: null, image: '', shareReady: false, error: errorMessage(error, '这篇文章暂时无法查看。') }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  onShareAppMessage() {
    const article = this.data.article, image = this.data.image;
    if (!article || !this.data.shareReady || !image) {
      if (this.sharePayload) return this.sharePayload;
      throw new Error('这篇文章暂时无法分享。');
    }
    return { title: article.title, path: '/pages/article/index?id=' + encodeURIComponent(article.id), imageUrl: image };
  },
  list() { void wx.switchTab({ url: '/pages/articles/index' }); },
  async editArticle(event: WechatMiniprogram.TouchEvent) {
    const services = miniServices(), id = this.data.ownerWorkId;
    if (!id) return;
    try {
      const status = await services.publications.status(id);
      if (!this.active || services !== miniServices() || status.articleId !== this.id) return;
      void wx.navigateTo({ url: (event.currentTarget.dataset.manage ? '/pages/publish/index?id=' : '/pages/editor/index?id=') + encodeURIComponent(id) });
    } catch (error) { this.setData({ error: errorMessage(error, '文章管理暂时无法打开。') }); }
  },
});
