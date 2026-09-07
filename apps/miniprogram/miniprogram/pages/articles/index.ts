import { accountPage } from '../../auth/page';
import { miniServices } from '../../services';
import { selectTab } from '../../ui/tab-bar';
import { errorMessage } from '../../ui/error-message';
import type { PublicArticleCard } from '../../domain/core';
type Card = PublicArticleCard & { image: string; date: string };
accountPage({
  sequence: 0, active: true,
  data: { cards: [] as Card[], loading: false, empty: false, error: '', cursor: null as string | null },
  onShow() { this.active = true; selectTab(this, 1); void this.load(false); },
  onHide() { this.active = false; this.sequence++; this.setData({ cards: [], loading: false, empty: false }); },
  onUnload() { this.active = false; this.sequence++; },
  async load(more = false) {
    if (this.data.loading) return;
    const services = miniServices(), sequence = ++this.sequence, cursor = more ? this.data.cursor : null;
    this.setData({ loading: true, empty: false, error: '', ...(more ? {} : { cards: [], cursor: null }) });
    try {
      const page = await services.publications.list(cursor ?? undefined);
      if (!this.active || sequence !== this.sequence || services !== miniServices()) return;
      const cards: Card[] = page.articles.map(a => ({ ...a, image: '', date: a.publishedAt.slice(0, 10) }));
      const visible = more ? [...this.data.cards, ...cards.filter(c => !this.data.cards.some(old => old.id === c.id))] : cards;
      this.setData({ cards: visible, cursor: page.cursor, empty: visible.length === 0 });
      for (let i = 0; i < cards.length; i += 4) {
        await Promise.all(cards.slice(i, i + 4).map(async card => {
          try {
            const bytes = await services.publications.image(card.id, 'thumbnail');
            if (!this.active || sequence !== this.sequence || services !== miniServices()) return;
            const image = await services.publicationStorage.cacheImage('public-' + card.id + '-' + card.version, bytes);
            if (this.active && sequence === this.sequence && services === miniServices()) this.setData({ cards: this.data.cards.map(c => c.id === card.id ? { ...c, image } : c) });
          } catch { /* Text remains readable; detail always verifies current availability. */ }
        }));
      }
    } catch (error) { if (this.active && sequence === this.sequence && services === miniServices()) this.setData({ error: errorMessage(error, '文章暂时无法读取，请重试。') }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  refresh() { void this.load(false); },
  async onPullDownRefresh() { try { await this.load(false); } finally { void wx.stopPullDownRefresh(); } },
  onReachBottom() { this.more(); },
  more() { if (this.data.cursor) void this.load(true); },
  open(event: WechatMiniprogram.TouchEvent) { void wx.navigateTo({ url: '/pages/article/index?id=' + encodeURIComponent(String(event.currentTarget.dataset.id)) }); },
  write() { void wx.navigateTo({ url: '/pages/editor/index' }); },
});
