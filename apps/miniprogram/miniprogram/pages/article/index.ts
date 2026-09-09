import { miniServices } from '../../services';
import { cloudIdSchema, newId, type PublicArticle, type Engagement, type PublicComment, type OwnComment, type FlowerWallet } from '../../domain/core';
import { errorMessage } from '../../ui/error-message';
import { navigationMetrics } from '../../ui/navigation';
import { openLogin } from '../../auth/navigation';
import { socialReturn, takeSocialReturn, takeCancelledContext, type ReadingContext, type SocialIntent } from '../../social/intent';

const blankCounts = { likes: 0, comments: 0, flowers: 0 };
type CommentView = PublicComment & { own: boolean; stateLabel: string; date: string };
Page({
  id: '', sequence: 0, active: true, unsubscribe: undefined as (() => void) | undefined,
  scrollTop: 0, commentScroll: 0, commentPages: 1,
  observedAccount: '', observedDraftOwner: '', authenticated: false, source: '' as string,
  data: { coverHeight: 250, article: null as PublicArticle | null, image: '', loading: false, error: '', date: '', shareReady: false, ownerWorkId: '',
    logged: false, engagement: null as Engagement | null, counts: blankCounts, followLabel: '+ 关注',
    comments: [] as CommentView[], commentsCursor: null as string | null, commentsLoading: false, commentsError: '',
    sheet: '', draft: '', draftLength: 0, busy: '', socialError: '', notice: '', wallet: null as FlowerWallet | null, walletError: '',
    giftPending: false, commentPending: false, keyboardHeight: 0, panelHeight: 480, sheetHeight: 480, scrollHeight: 240, compactKeyboard: false, commentScroll: 0, stationery: ['pen', 'ink', 'paper', 'stone'], stationeryNames: ['笔', '墨', '纸', '砚'] },
  onLoad(options: Record<string, string | undefined>) {
    const parsed = cloudIdSchema.safeParse(options.id); this.id = parsed.success ? parsed.data : '';
    this.source = options.source === 'share' ? 'share' : '';
    this.resizeContent();
    const account = miniServices().account;
    this.unsubscribe = account.subscribe(state => {
      const key = state.generation + ':' + state.status;
      if (key === this.observedAccount) return;
      this.observedAccount = key;
      if (!['authenticated', 'offline'].includes(state.status) || this.observedDraftOwner !== (state.account?.id ?? '')) {
        this.sequence++;
        this.setData({ engagement: null, comments: [], wallet: null, article: null, image: '', shareReady: false, ownerWorkId: '', busy: '', draft: '', draftLength: 0, sheet: '', logged: false });
        void wx.hideShareMenu();
        if (this.active && state.status !== 'connecting') void this.refresh();
      }
    });
  },
  async onShow() {
    this.active = true;
    await miniServices().account.restore();
    if (!this.active) return;
    await this.refresh();
  },
  onHide() { this.active = false; this.sequence++; this.setData({ article: null, image: '', shareReady: false, engagement: null, comments: [], wallet: null, ownerWorkId: '', keyboardHeight: 0 }); void wx.hideShareMenu(); },
  onUnload() { this.active = false; this.sequence++; this.unsubscribe?.(); this.setData({ draft: '', comments: [] }); },
  onResize() { this.resizeContent(); },
  onPageScroll(event: { scrollTop: number }) { this.scrollTop = event.scrollTop; },
  commentScrolled(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) { this.commentScroll = event.detail.scrollTop; },
  resizeContent() { const info = wx.getWindowInfo(); this.setData({ coverHeight: (info.windowWidth - (info.windowWidth <= 370 ? 40 : 48)) * .8, panelHeight: Math.max(220, Math.min(640, info.windowHeight - 100)) }); },
  current(sequence: number, services: ReturnType<typeof miniServices>) { return this.active && sequence === this.sequence && services === miniServices(); },
  async refresh(retry: unknown = false) {
    const sequence = ++this.sequence, services = miniServices(), state = services.account.snapshot();
    const authenticated = Boolean(state.account && ['authenticated', 'offline'].includes(state.status));
    this.authenticated = authenticated; this.observedAccount = state.generation + ':' + state.status;
    if (this.observedDraftOwner !== (state.account?.id ?? '')) this.setData({ draft: '', draftLength: 0, sheet: '' });
    this.observedDraftOwner = state.account?.id ?? '';
    this.setData({ article: null, image: '', shareReady: false, engagement: null, comments: [], wallet: null, ownerWorkId: '', error: '', loading: true, socialError: '', logged: authenticated, commentsError: '', counts: blankCounts, busy: '' });
    void wx.hideShareMenu();
    try {
      if (!this.id) throw new Error('这篇文章暂时无法查看。');
      const article = await services.social.article(this.id, authenticated);
      if (!this.current(sequence, services)) return;
      this.setData({ article, date: article.publishedAt.slice(0, 10), counts: article.counts ?? blankCounts, loading: false });
      const details = this.refreshSocial(sequence, services);
      try {
        const bytes = await services.social.image(this.id, authenticated);
        if (!this.current(sequence, services)) return;
        const storage = authenticated ? services.publicationStorage : services.publicImages;
        const image = await storage.cacheImage('article-' + article.id + '-' + article.version + '-' + (article.audienceVersion ?? 0), bytes);
        const latest = await services.social.article(this.id, authenticated);
        if (!this.current(sequence, services)) return;
        if (latest.version !== article.version || latest.audienceVersion !== article.audienceVersion) {
          if (retry === true) throw new Error('文章正在更新，请稍后重试。');
          await this.refresh(true); return;
        }
        this.setData({ image, shareReady: true }); await wx.showShareMenu({ menus: ['shareAppMessage'] });
      } catch (error) {
        if (!this.current(sequence, services)) return;
        if ([401,403,404].includes((error as { status?: number }).status ?? 0)) throw error;
        this.setData({ socialError: '封面暂时无法读取，重新打开后可重试。' });
      }
      await details;
      if (!this.current(sequence, services)) return;
      if (this.source === 'share') services.social.event(this.id, 'share_entry_open', 'read', authenticated);
      if (authenticated && services.social.visitArticle(this.id)) services.social.event(this.id, 'return_visit', 'read', true);
      const intent = takeSocialReturn('article', this.id, state.account?.id ?? null, state.generation);
      const restored = intent?.context ?? takeCancelledContext(this.id, state.account?.id ?? null, state.generation);
      if (restored) {
        // Revalidate only the pages already read in this explicit login journey.
        const depth = restored.commentPages ?? 1;
        for (let page = 1; page < depth && this.data.commentsCursor; page++) {
          await this.loadComments(true, sequence, services);
          if (!this.current(sequence, services)) return;
          if (this.data.commentsError) break;
        }
        this.restoreContext(restored);
      }
      if (intent) {
        services.social.event(this.id, 'login_success', intent.intent.kind === 'report' ? 'comment' : intent.intent.kind, true);
        if (intent.intent.kind === 'comment') this.setData({ sheet: 'comments', draft: intent.intent.draft, draftLength: Array.from(intent.intent.draft).length });
        else if (intent.intent.kind === 'gift') await this.openGift();
        else if (intent.intent.kind === 'report') await this.reportReasons(intent.intent.commentId);
        else if ('target' in intent.intent) await this.applyReaction(intent.intent.kind, intent.intent.target, intent.operationId);
      }
    } catch (error) {
      if (this.current(sequence, services)) this.setData({ article: null, image: '', shareReady: false, engagement: null, comments: [], wallet: null, sheet: '', error: errorMessage(error, '这篇文章暂时无法查看。') });
    } finally { if (this.current(sequence, services)) { this.setData({ loading: false, giftPending: services.social.hasPending('gift:' + this.id) }); this.measureSheet(); } }
  },
  async refreshSocial(sequence?: number, services = miniServices()) {
    sequence ??= this.sequence;
    const tasks: Promise<unknown>[] = [this.loadComments(false, sequence, services)];
    if (this.authenticated) tasks.push((async () => {
      try {
        const engagement = await services.social.engagement(this.id);
        if (!this.current(sequence, services)) return;
        this.setData({ engagement, counts: engagement.counts, wallet: engagement.wallet,
          followLabel: engagement.relationship.mutual ? '互相关注' : engagement.relationship.active ? '已关注' : engagement.relationship.followedBy ? '回关' : '+ 关注',
          giftPending: services.social.hasPending('gift:' + this.id), commentPending: services.social.hasPending('comment:' + this.id) });
        this.mergeOwn(engagement.ownComments);
        const pendingText = services.social.pendingComment(this.id);
        if (pendingText !== undefined) this.setData({ draft: pendingText, draftLength: Array.from(pendingText).length });
      } catch (error) { if (this.current(sequence, services) && !this.invalidateTarget(error)) this.setData({ socialError: errorMessage(error, '互动状态暂时无法读取，请重试。'), engagement: null, wallet: null }); }
    })(), (async () => {
      try { const statuses = await services.publications.statuses(); if (this.current(sequence, services)) this.setData({ ownerWorkId: statuses.publications.find(s => s.articleId === this.id && s.published)?.workId ?? '' }); } catch { /* Ownership is never inferred. */ }
    })());
    await Promise.all(tasks);
  },
  mergeOwn(own: OwnComment[]) {
    const authorId = own[0]?.publicAuthorId;
    // Public older comments remain removable even outside the bounded own-status window.
    const map = new Map(this.data.comments.filter(c => !c.own || !c.stateLabel).map(c => [c.id, { ...c, own: Boolean(authorId && c.publicAuthorId === authorId) }]));
    for (const comment of own) if (!['deleted', 'hidden'].includes(comment.state)) map.set(comment.id, { ...comment, date: comment.createdAt.slice(0, 10), own: true, stateLabel: comment.state === 'pending' ? '审核中，仅自己可见' : comment.state === 'rejected' ? '未通过审核' + (comment.reason ? '：' + comment.reason : '') : '' });
    this.setData({ comments: [...map.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)) });
  },
  async loadComments(more: unknown = false, sequence?: number, services = miniServices()) {
    sequence ??= this.sequence;
    if (more === true && (!this.data.commentsCursor || this.data.commentsLoading)) return;
    this.setData({ commentsLoading: true, commentsError: '' });
    try {
      const result = await services.social.comments(this.id, this.authenticated, more === true ? this.data.commentsCursor : null);
      if (!this.current(sequence, services) || !this.data.article) return;
      const map = new Map((more === true ? this.data.comments : []).map(c => [c.id, c]));
      for (const item of result.comments) map.set(item.id, { ...item, date: item.createdAt.slice(0, 10), own: false, stateLabel: '' });
      this.commentPages = more === true ? this.commentPages + 1 : 1;
      this.setData({ comments: [...map.values()], commentsCursor: result.cursor });
      if (this.data.engagement) this.mergeOwn(this.data.engagement.ownComments);
    } catch (error) { if (this.current(sequence, services) && !this.invalidateTarget(error)) this.setData({ commentsError: errorMessage(error, '评论暂时无法读取，请重试。') }); }
    finally { if (this.current(sequence, services)) this.setData({ commentsLoading: false }); }
  },
  invalidateTarget(error: unknown) {
    if (![403, 404].includes((error as {status?: number}).status ?? 0)) return false;
    this.sequence++; this.setData({ article: null, image: '', engagement: null, comments: [], ownerWorkId: '', shareReady: false, sheet: '', loading: false, commentsLoading: false, busy: '', error: '这篇文章暂时无法查看。', giftPending: miniServices().social.hasPending('gift:' + this.id) }); void wx.hideShareMenu(); return true;
  },
  retrySocial() { void this.refreshSocial(); },
  moreComments() { void this.loadComments(true); },
  async loginIntent(intent: SocialIntent) {
    if (!this.id || this.data.busy) return;
    const services = miniServices(), state = services.account.snapshot();
    const target = socialReturn('article', this.id, intent, state.account?.id ?? null, state.generation);
    target.context = { draft: this.data.draft, scrollTop: this.scrollTop, sheet: this.data.sheet, commentScroll: this.commentScroll, commentPages: this.commentPages };
    services.social.event(this.id, 'login_intent', intent.kind === 'report' ? 'comment' : intent.kind, this.authenticated);
    this.setData({ busy: 'login' });
    try { await openLogin({ url: '/pages/article/index?id=' + encodeURIComponent(this.id), social: target }); }
    catch { if (this.active) this.setData({ socialError: '登录页暂时无法打开，请重试。', busy: '' }); }
  },
  loginRead() { void this.loginIntent({ kind: 'read' }); },
  async react(event: WechatMiniprogram.TouchEvent) {
    const source = miniServices(), sequence = this.sequence;
    const kind = event.currentTarget.dataset.kind as 'like' | 'collect' | 'follow';
    if (!['like', 'collect', 'follow'].includes(kind) || this.data.busy || !this.data.article) return;
    const active = kind === 'follow' ? this.data.engagement?.relationship.active : kind === 'like' ? this.data.engagement?.like.active : this.data.engagement?.collection.active;
    if (!this.authenticated) { await this.loginIntent({ kind, target: true }); return; }
    if (!this.data.engagement) { await this.refreshSocial(); return; }
    if (kind === 'follow' && active) { const confirm = await wx.showModal({ title: '取消关注？', content: '以后仍可从文章打开作者主页。', confirmText: '取消关注' }); if (!confirm.confirm || !this.current(sequence, source)) return; }
    await this.applyReaction(kind, !active);
  },
  async applyReaction(kind: 'like' | 'collect' | 'follow', active: boolean, operationId = newId()) {
    if (this.data.busy || !this.data.article || !this.data.engagement) return;
    if (!this.data.engagement.writesEnabled) { this.setData({ socialError: '互动暂未开放，请稍后再试。' }); return; }
    const services = miniServices(), sequence = this.sequence, engagement = this.data.engagement, author = this.data.article.publicAuthorId;
    const version = kind === 'follow' ? engagement.relationship.version : kind === 'like' ? engagement.like.version : engagement.collection.version;
    this.setData({ busy: kind, socialError: '' });
    try {
      if (kind === 'follow') {
        if (!author || engagement.relationship.self) return;
        const relationship = await services.social.follow(author, { active, expectedVersion: version, operationId });
        if (this.current(sequence, services)) this.setData({ engagement: { ...engagement, relationship }, followLabel: relationship.mutual ? '互相关注' : relationship.active ? '已关注' : relationship.followedBy ? '回关' : '+ 关注' });
      } else {
        const result = await services.social.reaction(this.id, kind === 'collect' ? 'collection' : 'like', { active, expectedVersion: version, operationId });
        if (this.current(sequence, services)) this.setData({ engagement: { ...engagement, [kind === 'collect' ? 'collection' : 'like']: result, counts: result.counts }, counts: result.counts });
      }
    } catch (error) {
      if (!this.current(sequence, services)) return;
      if (this.invalidateTarget(error)) return;
      this.setData({ socialError: errorMessage(error, '操作尚未确认，请重试。') });
      await this.refreshSocial(sequence, services);
    } finally { if (this.current(sequence, services)) { this.setData({ busy: '' }); this.measureSheet(); } }
  },
  openComments() { this.setData({ sheet: 'comments', socialError: '', notice: '' }); this.measureSheet(); },
  closeSheet() { this.setData({ sheet: '', keyboardHeight: 0 }); },
  inputComment(event: WechatMiniprogram.CustomEvent<{ value: string }>) { const draft = event.detail.value; this.setData({ draft, draftLength: Array.from(draft).length }); },
  keyboard(event: WechatMiniprogram.CustomEvent<{ height: number }>) { this.setData({ keyboardHeight: event.detail.height }); this.measureSheet(); },
  blurComment() { this.setData({ keyboardHeight: 0 }); this.measureSheet(); },
  measureSheet() {
    const info = wx.getWindowInfo(), navigation = navigationMetrics();
    const top = Math.max(navigation.navigationHeight, navigation.menuTop + navigation.menuHeight) + 8;
    const available = Math.max(0, info.windowHeight - this.data.keyboardHeight - top);
    const sheetHeight = Math.min(this.data.panelHeight, available), compactKeyboard = this.data.keyboardHeight > 0 && available < 350;
    const safe = Math.max(0, (info.screenHeight || info.windowHeight) - (info.safeArea?.bottom ?? info.screenHeight ?? info.windowHeight));
    const footer = (this.data.sheet === 'comments' ? compactKeyboard ? 180 : 224 : 176) + (compactKeyboard ? 0 : safe) + (this.data.socialError || this.data.notice ? compactKeyboard ? 48 : 64 : 0);
    this.setData({ sheetHeight, scrollHeight: Math.max(32, sheetHeight - footer), compactKeyboard });
  },
  restoreContext(context: ReadingContext) {
    this.setData({ draft: context.draft, draftLength: Array.from(context.draft).length, sheet: context.sheet, commentScroll: context.commentScroll });
    this.scrollTop = context.scrollTop; this.commentScroll = context.commentScroll;
    void wx.pageScrollTo({ scrollTop: context.scrollTop, duration: 0 }); this.measureSheet();
  },
  async publishComment() {
    if (this.data.busy || !this.data.article) return;
    const text = this.data.draft.trim(), length = Array.from(text).length;
    if (!length || length > 300) { this.setData({ socialError: '评论请填写 1–300 字。' }); return; }
    if (!this.authenticated) { await this.loginIntent({ kind: 'comment', draft: this.data.draft }); return; }
    if (!this.data.engagement?.commentsEnabled || !this.data.engagement.writesEnabled) { this.setData({ socialError: '评论暂不可用，请稍后再试。' }); return; }
    const services = miniServices(), sequence = this.sequence;
    this.setData({ busy: 'comment', socialError: '' });
    try {
      const comment = await services.social.comment(this.id, text);
      if (!this.current(sequence, services)) return;
      this.setData({ draft: '', draftLength: 0, commentPending: false, notice: '已提交审核' });
      this.mergeOwn([...(this.data.engagement?.ownComments ?? []).filter(c => c.id !== comment.id), comment]);
      await this.refreshSocial(sequence, services);
    } catch (error) { if (this.current(sequence, services) && !this.invalidateTarget(error)) this.setData({ socialError: errorMessage(error, '提交结果尚未确认，请重试。'), commentPending: services.social.hasPending('comment:' + this.id) }); }
    finally { if (this.current(sequence, services)) { this.setData({ busy: '' }); this.measureSheet(); } }
  },
  async commentMore(event: WechatMiniprogram.TouchEvent) {
    const comment = this.data.comments.find(c => c.id === event.currentTarget.dataset.id);
    if (!comment || this.data.busy) return;
    const services = miniServices(), sequence = this.sequence;
    try {
      const choice = await wx.showActionSheet({ itemList: [comment.own ? '删除我的评论' : '举报评论'] });
      if (choice.tapIndex !== 0 || !this.current(sequence, services)) return;
      if (!this.authenticated) { await this.loginIntent({ kind: 'report', commentId: comment.id }); return; }
      if (comment.own) {
        const confirmed = await wx.showModal({ title: '删除这条评论？', content: '删除后将不再显示。', confirmText: '删除' });
        if (!confirmed.confirm || !this.current(sequence, services)) return;
        this.setData({ busy: 'delete', socialError: '' }); await services.social.deleteComment(comment.id, comment.version);
      } else {
        await this.reportReasons(comment.id);
      }
      if (this.current(sequence, services)) await this.refreshSocial(sequence, services);
    } catch (error) { if (this.current(sequence, services) && !/cancel/i.test((error as { errMsg?: string }).errMsg ?? '')) this.setData({ socialError: errorMessage(error, '操作未完成，请重试。') }); }
    finally { if (this.current(sequence, services)) { this.setData({ busy: '' }); this.measureSheet(); } }
  },
  async reportReasons(id: string) {
    const services = miniServices(), sequence = this.sequence;
    if (!this.data.comments.some(c => c.id === id && !c.own)) { this.setData({ socialError: '这条评论已不可用。' }); return; }
    try {
      const reasons = ['不友善或攻击他人', '广告或无关内容', '侵犯隐私', '其他不合适内容'];
      const choice = await wx.showActionSheet({ itemList: reasons });
      if (!this.current(sequence, services)) return;
      this.setData({ busy: 'report', socialError: '' }); await services.social.report(id, reasons[choice.tapIndex]!);
      if (this.current(sequence, services)) this.setData({ notice: '举报已提交，等待处理。' });
    } catch (error) { if (this.current(sequence, services) && !/cancel/i.test((error as { errMsg?: string }).errMsg ?? '')) this.setData({ socialError: errorMessage(error, '举报未确认，请重试。') }); }
    finally { if (this.current(sequence, services)) { this.setData({ busy: '' }); this.measureSheet(); } }
  },
  async openGift() {
    this.setData({ sheet: 'gift', socialError: this.data.engagement && !this.data.engagement.writesEnabled ? '赠送暂未开放，请稍后再试。' : '', notice: '', wallet: null, walletError: '' }); this.measureSheet();
    if (!this.authenticated) return;
    const services = miniServices(), sequence = this.sequence;
    try { const wallet = await services.social.claim(); if (this.current(sequence, services)) this.setData({ wallet, giftPending: services.social.hasPending('gift:' + this.id) }); }
    catch (error) { if (this.current(sequence, services)) this.setData({ walletError: errorMessage(error, '库存暂时无法读取。') }); }
  },
  async sendFlower() {
    if (this.data.busy) return;
    if (!this.authenticated) { await this.loginIntent({ kind: 'gift' }); return; }
    const services = miniServices(), sequence = this.sequence, pending = services.social.hasPending('gift:' + this.id);
    if (!pending && (!this.data.article || !this.data.engagement?.writesEnabled || this.data.engagement.relationship.self || !this.data.wallet || this.data.wallet.balance < 1)) return;
    this.setData({ busy: 'gift', socialError: '' });
    try {
      const receipt = await services.social.gift(this.id);
      if (!this.current(sequence, services)) return;
      this.setData({ giftPending: false, notice: '小花花已送达', counts: { ...this.data.counts, flowers: receipt.flowers }, wallet: this.data.wallet ? { ...this.data.wallet, balance: receipt.balance } : null });
    } catch (error) { if (this.current(sequence, services) && !this.invalidateTarget(error)) this.setData({ socialError: errorMessage(error, '赠送结果尚未确认，请核对原操作。'), giftPending: services.social.hasPending('gift:' + this.id) }); }
    finally { if (this.current(sequence, services)) { this.setData({ busy: '' }); this.measureSheet(); } }
  },
  onShareAppMessage() {
    const article = this.data.article;
    if (!article || !this.data.shareReady || !this.data.image) throw new Error('这篇文章暂时无法分享。');
    return { title: article.title, path: '/pages/article/index?id=' + encodeURIComponent(article.id) + '&source=share', imageUrl: this.data.image };
  },
  openAuthor(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id || this.data.article?.publicAuthorId; if (id && cloudIdSchema.safeParse(id).success) void wx.navigateTo({ url: '/pages/author/index?id=' + encodeURIComponent(id) }); },
  list() { void wx.switchTab({ url: '/pages/articles/index' }); },
  async editArticle(event: WechatMiniprogram.TouchEvent) {
    const services = miniServices(), id = this.data.ownerWorkId;
    if (!id) return;
    try { const status = await services.publications.status(id); if (!this.active || services !== miniServices() || status.articleId !== this.id) return;
      void wx.navigateTo({ url: (event.currentTarget.dataset.manage ? '/pages/publish/index?id=' : '/pages/editor/index?id=') + encodeURIComponent(id) });
    } catch (error) { this.setData({ socialError: errorMessage(error, '文章管理暂时无法打开。') }); }
  },
  noop() {},
});
