import { accountPage } from '../auth/page';
import { openLogin } from '../auth/navigation';
import { miniServices } from '../services';
import { cloudIdSchema, newId, type AuthorProfile, type PublicArticleCard, type CollectionItem, type RelationshipItem, type FlowerWallet, type FlowerHistoryPage } from '../domain/core';
import { errorMessage } from '../ui/error-message';
import { socialReturn, takeSocialReturn } from './intent';

type Kind = 'author' | 'collections' | 'relationships' | 'flowers';
type ArticleRow = PublicArticleCard & { image: string; date: string };
export function socialPage(kind: Kind) {
  const register = kind === 'author' ? Page : accountPage;
  register({
    id: '', active: true, sequence: 0, authenticated: false,
    unsubscribe: undefined as (() => void) | undefined,
    data: { kind, tab: 'following' as 'following' | 'followers' | 'mutuals', needsLogin: false, loading: false, moreLoading: false, error: '', busy: '',
      author: null as AuthorProfile | null, articles: [] as ArticleRow[], collections: [] as (CollectionItem & { image: string; date: string })[],
      authors: [] as RelationshipItem[], wallet: null as FlowerWallet | null, history: [] as (FlowerHistoryPage['entries'][number] & {date: string})[], cursor: null as string | null,
      followLabel: '+ 关注', stationery: ['pen', 'ink', 'paper', 'stone'], stationeryNames: ['笔', '墨', '纸', '砚'] },
    onLoad(options: Record<string, string | undefined>) {
      const parsed = cloudIdSchema.safeParse(options.id); this.id = parsed.success ? parsed.data : '';
      if (['following', 'followers', 'mutuals'].includes(options.tab ?? '')) this.setData({ tab: options.tab as 'following' | 'followers' | 'mutuals' });
      const source = miniServices();
      this.unsubscribe = source.account.subscribe(state => {
        if (source !== miniServices() || !['authenticated', 'offline'].includes(state.status)) {
          this.sequence++; this.setData({ author: null, articles: [], collections: [], authors: [], wallet: null, history: [], cursor: null, busy: '', loading: false, moreLoading: false, needsLogin: kind !== 'author', error: kind === 'author' ? '' : '登录已失效，请重新登录后查看。' });
          if (kind === 'author' && this.active && state.status !== 'connecting') void this.refresh();
        }
      });
    },
    async onShow() { this.active = true; if (kind === 'author') await miniServices().account.restore(); if (this.active) await this.refresh(); },
    onHide() { this.active = false; this.sequence++; },
    onUnload() { this.active = false; this.sequence++; this.unsubscribe?.(); },
    onReachBottom() { void this.more(); },
    valid(sequence: number, source: ReturnType<typeof miniServices>) { return this.active && this.sequence === sequence && source === miniServices(); },
    async refresh() {
      const sequence = ++this.sequence, source = miniServices(), state = source.account.snapshot();
      this.authenticated = Boolean(state.account && ['authenticated', 'offline'].includes(state.status));
      this.setData({ loading: true, moreLoading: false, needsLogin: false, error: '', author: null, articles: [], collections: [], authors: [], wallet: null, history: [], cursor: null, busy: '' });
      try {
        if (kind !== 'author' && !this.authenticated) { this.setData({ needsLogin: true }); throw new Error('登录已失效，请重新登录后查看。'); }
        if (kind === 'author') {
          if (!this.id) throw new Error('作者主页暂时无法查看。');
          const author = await source.social.author(this.id, this.authenticated);
          if (!this.valid(sequence, source)) return;
          this.setAuthor(author);
        } else if (kind === 'flowers') {
          const wallet = await source.social.claim(); if (!this.valid(sequence, source)) return; this.setData({ wallet });
        }
        await this.loadPage(false, sequence, source);
        if (!this.valid(sequence, source)) return;
        if (kind === 'author') {
          const resumed = takeSocialReturn('author', this.id, state.account?.id ?? null, state.generation);
          if (resumed?.intent.kind === 'follow') await this.setFollow(this.id, resumed.intent.target, resumed.operationId);
        }
      } catch (error) { if (this.valid(sequence, source)) this.setData({ error: errorMessage(error, '暂时无法读取，请重试。') }); }
      finally { if (this.valid(sequence, source)) this.setData({ loading: false }); }
    },
    setAuthor(author: AuthorProfile) { const r = author.relationship; this.setData({ author, followLabel: r?.mutual ? '互相关注' : r?.active ? '已关注' : r?.followedBy ? '回关' : '+ 关注' }); },
    async loadPage(more: boolean, sequence: number, source: ReturnType<typeof miniServices>) {
      const cursor = more ? this.data.cursor : null;
      if (kind === 'author') {
        const response = await source.social.articles(this.id, this.authenticated, cursor);
        if (!this.valid(sequence, source)) return;
        const rows = [...(more ? this.data.articles : []), ...response.articles.map(a => ({ ...a, image: '', date: a.publishedAt.slice(0, 10) }))];
        this.setData({ articles: [...new Map(rows.map(a => [a.id, a])).values()], cursor: response.cursor });
        await this.images(response.articles.map(a => a.id), sequence, source);
      } else if (kind === 'collections') {
        const response = await source.social.collections(cursor);
        if (!this.valid(sequence, source)) return;
        const rows = [...(more ? this.data.collections : []), ...response.collections.map(a => ({ ...a, image: '', date: a.article?.publishedAt.slice(0, 10) ?? '' }))];
        this.setData({ collections: [...new Map(rows.map(a => [a.articleId, a])).values()], cursor: response.cursor });
        await this.images(response.collections.filter(a => a.available).map(a => a.articleId), sequence, source);
      } else if (kind === 'relationships') {
        const response = await source.social.relationships(this.data.tab, cursor);
        if (!this.valid(sequence, source)) return;
        this.setData({ authors: [...new Map([...(more ? this.data.authors : []), ...response.authors].map(a => [a.id, a])).values()], cursor: response.cursor });
      } else {
        const response = await source.social.history(cursor);
        if (!this.valid(sequence, source)) return;
        this.setData({ history: [...new Map([...(more ? this.data.history : []), ...response.entries.map(a => ({...a, date: a.createdAt.slice(0, 10)}))].map(a => [a.id, a])).values()], cursor: response.cursor });
      }
    },
    async images(ids: string[], sequence: number, source: ReturnType<typeof miniServices>) {
      let index = 0;
      const worker = async () => {
        while (index < ids.length && this.valid(sequence, source)) {
          const id = ids[index++]!;
          try {
            const bytes = await source.social.image(id, this.authenticated, 'thumbnail');
            if (!this.valid(sequence, source)) return;
            const storage = this.authenticated ? source.publicationStorage : source.publicImages;
            const image = await storage.cacheImage('social-thumb-' + id, bytes);
            // Recheck after disk IO so a known withdrawal removes the whole list projection.
            await source.social.article(id, this.authenticated);
            if (!this.valid(sequence, source)) return;
            if (kind === 'author') this.setData({ articles: this.data.articles.map(a => a.id === id ? { ...a, image } : a) });
            else this.setData({ collections: this.data.collections.map(a => a.articleId === id ? { ...a, image } : a) });
          } catch (error) {
            if (this.valid(sequence, source) && [403, 404].includes((error as {status?: number}).status ?? 0)) {
              if (kind === 'author') this.setData({ articles: this.data.articles.filter(a => a.id !== id) });
              else this.setData({ collections: this.data.collections.map(a => a.articleId === id ? { ...a, available: false, article: null, image: '', date: '' } : a) });
            }
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    },
    async more() {
      if (this.data.loading || this.data.moreLoading || !this.data.cursor) return;
      const sequence = this.sequence, source = miniServices(); this.setData({ moreLoading: true, error: '' });
      try { await this.loadPage(true, sequence, source); }
      catch (error) { if (this.valid(sequence, source)) this.setData({ error: errorMessage(error, '下一页暂时无法读取。') }); }
      finally { if (this.valid(sequence, source)) this.setData({ moreLoading: false }); }
    },
    switchTab(event: WechatMiniprogram.TouchEvent) { const tab = event.currentTarget.dataset.tab; if (this.data.busy || tab === this.data.tab || !['following', 'followers', 'mutuals'].includes(tab)) return; this.setData({ tab }); void this.refresh(); },
    openArticle(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id; if (cloudIdSchema.safeParse(id).success) void wx.navigateTo({ url: '/pages/article/index?id=' + encodeURIComponent(id) }); },
    openAuthor(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id; if (cloudIdSchema.safeParse(id).success) void wx.navigateTo({ url: '/pages/author/index?id=' + encodeURIComponent(id) }); },
    async follow(event: WechatMiniprogram.TouchEvent) {
      const id = kind === 'author' ? this.id : event.currentTarget.dataset.id;
      const relation = kind === 'author' ? this.data.author?.relationship : this.data.authors.find(a => a.id === id)?.relationship;
      if (this.data.busy || relation?.self) return;
      const source = miniServices(), sequence = this.sequence, state = source.account.snapshot();
      if (!this.authenticated) { await openLogin({ url: '/pages/author/index?id=' + encodeURIComponent(id), social: socialReturn('author', id, { kind: 'follow', target: true }, state.account?.id ?? null, state.generation) }); return; }
      if (!relation) { await this.refresh(); return; }
      if (relation.active) { const confirm = await wx.showModal({ title: '取消关注？', content: '仅取消您对这位作者的关注。', confirmText: '取消关注' }); if (!confirm.confirm || !this.valid(sequence, source)) return; }
      await this.setFollow(id, !relation.active);
    },
    async setFollow(id: string, active: boolean, operationId = newId()) {
      const relation = kind === 'author' ? this.data.author?.relationship : this.data.authors.find(a => a.id === id)?.relationship;
      if (!relation || relation.self || this.data.busy) return;
      const source = miniServices(), sequence = this.sequence; this.setData({ busy: id, error: '' });
      try {
        const relationship = await source.social.follow(id, { active, expectedVersion: relation.version, operationId });
        if (!this.valid(sequence, source)) return;
        if (kind === 'author' && this.data.author) { const author = await source.social.author(id, true); if (this.valid(sequence, source)) this.setAuthor(author); }
        else this.setData({ authors: this.data.authors.map(a => a.id === id ? { ...a, relationship } : a).filter(a => this.data.tab === 'followers' || (this.data.tab === 'following' ? a.relationship.active : a.relationship.mutual)) });
      } catch (error) { if (this.valid(sequence, source)) this.setData({ error: errorMessage(error, '关注状态尚未确认，请重新读取。') }); }
      finally { if (this.valid(sequence, source)) this.setData({ busy: '' }); }
    },
    async removeCollection(event: WechatMiniprogram.TouchEvent) {
      const item = this.data.collections.find(a => a.articleId === event.currentTarget.dataset.id);
      if (!item || this.data.busy) return;
      const source = miniServices(), sequence = this.sequence; this.setData({ busy: item.articleId, error: '' });
      try { await source.social.reaction(item.articleId, 'collection', { active: false, expectedVersion: item.version, operationId: newId() }); if (this.valid(sequence, source)) this.setData({ collections: this.data.collections.filter(a => a.articleId !== item.articleId) }); }
      catch (error) { if (this.valid(sequence, source)) this.setData({ error: errorMessage(error, '取消收藏尚未确认，请重新读取。') }); }
      finally { if (this.valid(sequence, source)) this.setData({ busy: '' }); }
    },
    login() { void openLogin({ url: '/pages/' + kind + '/index' + (kind === 'relationships' ? '?tab=' + this.data.tab : '') }); },
    readArticles() { void wx.switchTab({ url: '/pages/articles/index' }); },
  });
}
