import { errorMessage } from '../../ui/error-message';
import { authorArticleAction } from '../../publication/presentation';
import type { OwnSubmission } from '../../publication/client';
import { articleText, countWords, formatTime, publicationLabel, type Work } from '../../domain/core';
import { miniServices } from '../../services';
import { authorOverview, selectAuthorArticles } from '../../ui/author-library';

interface WorkCard {
  id: string;
  title: string;
  meta: string;
  excerpt: string;
  date: string;
  words: number;
  updatedAt: string;
  revision: number;
  deleted: boolean;
  recovery: boolean;
  publication: string;
  category: 'draft' | 'pending' | 'published' | 'unknown';
  published: boolean;
  action: string;
  url: string;
}

function card(work: Work): WorkCard {
  return { id: work.id, title: work.title, excerpt: articleText(work.segments).replace(/\s+/g, ' ').trim(), date: formatTime(work.updatedAt), words: countWords(work.segments), updatedAt: work.updatedAt, action: '编辑文章', url: '/pages/editor/index?id=' + encodeURIComponent(work.id), revision: work.revision, deleted: Boolean(work.deletedAt),
    recovery: false, publication: '草稿', category: 'draft', published: false, meta: `${formatTime(work.updatedAt)} · ${countWords(work.segments)} 字` };
}

type Services = ReturnType<typeof miniServices>;
interface LibraryState { services?: Services; unsubscribe?: () => void; accountUnsubscribe?: () => void; alive: boolean; visible: boolean; sequence: number;
  flight?: Promise<void>; refreshAgain: boolean; connectAgain: boolean; connecting: boolean; syncKey?: string;
  snapshot?: Awaited<ReturnType<Services['repository']['load']>>; statuses: Awaited<ReturnType<Services['publications']['statuses']>>['publications'];
  submissions: Map<string, Promise<OwnSubmission>> }
const states = new WeakMap<object, LibraryState>();
function context(instance: object) { let state = states.get(instance); if (!state) { state = { alive: true, visible: true, sequence: 0, refreshAgain: false, connectAgain: false, connecting: false, statuses: [], submissions: new Map() }; states.set(instance, state); } return state; }
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { recycle: Boolean, embedded: Boolean, suppressIssue: Boolean },
  data: { loading: true, manage: false, filter: 'all', empty: false, total: 0, limit: 20, hasMore: false,
    query: '', recentDraft: null as WorkCard | null, recentCards: [] as WorkCard[], publishedCount: 0, statusUnavailable: false, cards: [] as WorkCard[], visible: [] as WorkCard[], issue: '', deleting: false },
  lifetimes: {
    attached() {
      const state = context(this); state.alive = true;
      state.accountUnsubscribe = miniServices().account.subscribe(() => { if (state.services !== miniServices()) {
        this.setData({ cards: [], visible: [], recentDraft: null, recentCards: [], total: 0, publishedCount: 0, empty: false, loading: true, manage: false, query: '', filter: 'all', limit: 20, deleting: false, issue: '', statusUnavailable: false }); state.snapshot = undefined; state.statuses = []; state.submissions.clear();
        state.unsubscribe?.(); state.services = undefined; state.sequence++; void this.refresh(false, true);
      } });
      void this.refresh();
    },
    detached() { const state = context(this); state.alive = false; state.sequence++; state.unsubscribe?.(); state.accountUnsubscribe?.(); },
  },
  pageLifetimes: {
    show() { const state = context(this), wasVisible = state.visible; state.visible = true; void this.refresh(true, !wasVisible); },
    hide() { const state = context(this); state.visible = false; state.sequence++; state.refreshAgain = true; },
  },
  methods: {
  refresh(connect = true, changed = false): Promise<void> {
    const state = context(this);
    if (!state.alive || !state.visible) { state.refreshAgain = true; return Promise.resolve(); }
    if (state.flight) {
      if (changed) { state.refreshAgain = true; state.connectAgain ||= connect; state.sequence++; }
      return state.flight;
    }
    state.refreshAgain = true; state.connectAgain = connect;
    state.flight = (async () => {
      while (state.alive && state.visible && state.refreshAgain) {
        const shouldConnect = state.connectAgain; state.refreshAgain = false; state.connectAgain = false;
        await this.readCards(shouldConnect);
      }
    })().finally(() => { state.flight = undefined; });
    return state.flight;
  },
  async readCards(connect: boolean) {
    const state = context(this), sequence = ++state.sequence;
    const services = miniServices();
    if (state.services !== services) {
      state.unsubscribe?.(); state.services = services; state.syncKey = undefined;
      state.unsubscribe = services.sync.subscribe(sync => {
        const key = sync.status + ':' + sync.error, previous = state.syncKey; state.syncKey = key;
        if (!state.alive || !state.visible || sync.status === 'syncing' || key === previous || state.connecting) return;
        void this.refresh(false, true);
      });
    }
    try {
      await services.writer.flush();
      if (services !== miniServices() || !state.alive || !state.visible || sequence !== state.sequence) return;
      let cloudIssue = '';
      if (connect) {
        state.connecting = true;
        try { await services.sync.sync(); } catch (error) { cloudIssue = errorMessage(error, '云端尚未连接。'); }
        finally { state.connecting = false; }
      }
      const snapshot = await services.repository.load();
      if (services !== miniServices() || !state.alive || !state.visible || sequence !== state.sequence) return;
      let statuses: Awaited<ReturnType<typeof services.publications.statuses>> = { publications: [] };
      let statusKnown = !services.account || services.account.snapshot().status === 'authenticated';
      let publicationIssue = '';
      if (statusKnown) try { statuses = await services.publications.statuses(); } catch (error) { statusKnown = false; publicationIssue = errorMessage(error, '发表状态暂未更新，请稍后重试。'); }
      if (services !== miniServices() || !state.alive || !state.visible || sequence !== state.sequence) return;
      state.snapshot = snapshot; state.statuses = statuses.publications;
      const cards = snapshot.works.map(work => { const aggregate = snapshot.aggregates?.find(item => item.work.id === work.id) ?? null;
        const status = statuses.publications.find(item => item.workId === work.id);
        const category: WorkCard['category'] = !statusKnown ? 'unknown' : status?.pending ? 'pending' : status?.published ? 'published' : 'draft';
        return { ...card(work), ...authorArticleAction(work, aggregate?.session, status), category, published: Boolean(status?.published), publication: statusKnown ? publicationLabel(status) : '发表状态暂未更新', recovery: Boolean(aggregate?.cloud?.recoveryOf) }; });
      this.setData({ loading: false, cards, statusUnavailable: !statusKnown,
        issue: cloudIssue || services.sync.snapshot().error || publicationIssue || snapshot.issues.map(item => item.message).join(' ') });
      this.filterCards();
    } catch (error) {
      if (state.alive && state.visible && services === miniServices() && sequence === state.sequence) this.setData({ loading: false, issue: errorMessage(error, '本机作品暂时无法读取。') });
    }
  },

  filterCards() {
    const works = this.data.cards.filter(item => item.deleted === Boolean(this.data.recycle));
    const matching = selectAuthorArticles(this.data.cards, Boolean(this.data.recycle), this.data.filter, this.data.query);
    const overview = authorOverview(this.data.cards);
    this.setData({ visible: matching.slice(0, this.data.limit), total: works.length, empty: matching.length === 0, hasMore: !this.data.embedded && matching.length > this.data.limit,
      recentDraft: overview.draft, recentCards: overview.recent, publishedCount: overview.published });
    this.triggerEvent('summary', { total: overview.total, published: overview.published, statusKnown: !this.data.statusUnavailable });
    void this.updateVisibleActions();
  },
  searchArticles(event: WechatMiniprogram.Input) { this.setData({ query: event.detail.value, limit: 20 }); this.filterCards(); },
  openAll() { void wx.navigateTo({ url: '/pages/works/index' }); },
  retry() { void this.refresh(); },
  more() { this.setData({ limit: this.data.limit + 20 }); this.filterCards(); },
  async updateVisibleActions() {
    const state = context(this), services = state.services, sequence = state.sequence;
    if (!services || !state.alive || !state.visible || this.data.recycle) return;
    const displayed = this.data.embedded ? [this.data.recentDraft, ...this.data.recentCards].filter((item): item is WorkCard => Boolean(item)) : this.data.visible;
    const pending = displayed.filter(item => item.published && item.category !== 'pending');
    for (let offset = 0; offset < pending.length; offset += 4) await Promise.all(pending.slice(offset, offset + 4).map(async item => {
      if (!state.alive || !state.visible || sequence !== state.sequence || services !== miniServices()) return;
      const status = state.statuses.find(p => p.workId === item.id), aggregate = state.snapshot?.aggregates?.find(a => a.work.id === item.id);
      if (!status?.lastSubmission || status.lastSubmission.state !== 'approved' || !aggregate) return;
      try {
        const id = status.lastSubmission.id;
        if (!state.submissions.has(id)) state.submissions.set(id, services.publications.submission(item.id, id));
        const submitted = await state.submissions.get(id)!;
        const local = await services.publicationStorage.load(item.id);
        if (!state.alive || !state.visible || sequence !== state.sequence || services !== miniServices()) return;
        const action = authorArticleAction(aggregate.work, aggregate.session, status, submitted, local.dirty);
        const update = { ...item, ...action, publication: action.changed ? '已发表 · 有未提交修改' : item.publication };
        this.setData({ cards: this.data.cards.map(c => c.id === item.id ? update : c), visible: this.data.visible.map(c => c.id === item.id ? update : c), recentCards: this.data.recentCards.map(c => c.id === item.id ? update : c) });
      } catch {
        state.submissions.delete(status.lastSubmission.id);
        if (state.alive && state.visible && sequence === state.sequence && services === miniServices()) {
          const safeAction = (c: WorkCard) => c.id === item.id ? { ...c, action: '编辑文章', url: '/pages/editor/index?id=' + encodeURIComponent(c.id) } : c;
          this.setData({ cards: this.data.cards.map(safeAction), visible: this.data.visible.map(safeAction), recentCards: this.data.recentCards.map(safeAction) });
        }
      }
    }));
  },
  selectFilter(event: WechatMiniprogram.TouchEvent) {
    const filter = String(event.currentTarget.dataset.filter);
    if (!['all', 'draft', 'pending', 'published'].includes(filter)) return;
    this.setData({ filter, limit: 20 }); this.filterCards();
  },

  async openMenu(event: WechatMiniprogram.TouchEvent) {
    const state = context(this), services = state.services;
    const item = this.data.cards.find(c => c.id === String(event.currentTarget.dataset.id));
    if (!services || !item || this.data.deleting) return;
    const choices = this.data.recycle ? ['永久删除'] : item.recovery ? ['查看恢复稿', '另存新篇', '导出文字', '移入回收站']
      : item.category === 'pending' ? ['查看本次投稿', '移入回收站'] : item.published ? ['编辑文章', '查看发表状态', '移入回收站'] : ['编辑文章', '移入回收站'];
    try {
      const result = await wx.showActionSheet({ itemList: choices });
      if (services !== miniServices() || !state.alive) return;
      const latest = this.data.cards.find(c => c.id === item.id);
      if (!latest || latest.revision !== item.revision || latest.deleted !== item.deleted) { await this.refresh(false); return; }
      const selected = choices[result.tapIndex];
      const actionEvent = { currentTarget: { dataset: { id: item.id, revision: item.revision } } } as unknown as WechatMiniprogram.TouchEvent;
      if (selected === '永久删除') this.permanentlyDelete(actionEvent);
      else if (selected === '移入回收站') await this.moveToRecycle(actionEvent);
      else if (selected === '另存新篇') await this.promoteRecovery(actionEvent);
      else if (selected === '导出文字') await this.exportRecovery(actionEvent);
      else void wx.navigateTo({ url: (selected === '查看本次投稿' || selected === '查看发表状态' ? '/pages/publish/index?id=' : '/pages/editor/index?id=') + encodeURIComponent(item.id) });
    } catch (error) { if (services === miniServices() && state.alive && !String((error as { errMsg?: string }).errMsg ?? error).includes('cancel')) this.setData({ issue: errorMessage(error, '操作暂时无法打开，请重试。') }); }
  },
  toggleManage() { this.setData({ manage: !this.data.manage }); this.triggerEvent('manage', { value: this.data.manage }); },
  startWriting() {
    wx.navigateTo({ url: '/pages/editor/index', fail: error => {
      const issue = errorMessage(error, '写作页暂时无法打开，请重试。');
      this.setData({ issue });
      wx.showToast({ title: '写作页暂时无法打开，请重试', icon: 'none' });
    } });
  },

  openArticle(event: WechatMiniprogram.TouchEvent) {
    if (this.data.recycle) return;
    const item = this.data.cards.find(c => c.id === String(event.currentTarget.dataset.id));
    if (item) void wx.navigateTo({ url: item.url });
  },
  async moveToRecycle(event: WechatMiniprogram.TouchEvent) {
    if (this.data.deleting) return;
    const services = context(this).services!, id = String(event.currentTarget.dataset.id), revision = Number(event.currentTarget.dataset.revision);
    const item = this.data.cards.find(c => c.id === id);
    this.setData({ deleting: true, issue: '' });
    try {
      const result = await wx.showModal({ title: '删除这篇文章？', content: '文章将移入回收站，可以恢复。' + (item?.published || item?.category === 'pending' ? '待审核稿和已发表文章也会撤下，恢复后需要重新投稿。' : ''), confirmText: '删除', confirmColor: '#944924' });
      if (!result.confirm || services !== miniServices() || !context(this).alive) return;
      await services.sync.lifecycle(id, 'trash', revision);
      await this.refresh(true, true);
    } catch (error) { if (services === miniServices() && context(this).alive) this.setData({ issue: errorMessage(error, '删除未完成，请重试。') }); }
    finally { if (context(this).alive && services === miniServices()) this.setData({ deleting: false }); }
  },
  async restore(event: WechatMiniprogram.TouchEvent) {
    const state = context(this), services = state.services;
    if (!services || this.data.deleting) return;
    const id = String(event.currentTarget.dataset.id), revision = Number(event.currentTarget.dataset.revision);
    this.setData({ deleting: true, issue: '' });
    try { await services.sync.lifecycle(id, 'restore', revision); if (services === miniServices() && state.alive) await this.refresh(true, true); }
    catch (error) { if (services === miniServices() && state.alive) this.setData({ issue: errorMessage(error, '恢复失败。') }); }
    finally { if (services === miniServices() && state.alive) this.setData({ deleting: false }); }
  },

  viewRecovery(event: WechatMiniprogram.TouchEvent) {
    void wx.navigateTo({ url: '/pages/editor/index?id=' + encodeURIComponent(String(event.currentTarget.dataset.id)) });
  },
  async promoteRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = context(this).services!;
    try { await services.repository.promoteRecovery(String(event.currentTarget.dataset.id)); if (services === miniServices() && context(this).alive) await this.refresh(true, true); }
    catch (error) { if (services === miniServices() && context(this).alive) this.setData({ issue: errorMessage(error, '另存失败，恢复稿仍保留。') }); }
  },
  async exportRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = context(this).services!;
    try { const item = await services.repository.getAggregate(String(event.currentTarget.dataset.id));
      if (item && services === miniServices()) await services.backups.rescue(item.work.draft, item.session, item.writingState);
    } catch (error) { if (services === miniServices() && context(this).alive) this.setData({ issue: errorMessage(error, '恢复稿导出失败。') }); }
  },
  async permanentlyDelete(event: WechatMiniprogram.TouchEvent) {
    const state = context(this), services = state.services;
    if (!services || this.data.deleting) return;
    const id = String(event.currentTarget.dataset.id), revision = Number(event.currentTarget.dataset.revision);
    this.setData({ deleting: true, issue: '' });
    try {
      const result = await wx.showModal({ title: '永久删除这篇文章？', content: '删除后只能通过你之前导出的文字副本恢复。其他文章不受影响。', confirmText: '永久删除', confirmColor: '#944924' });
      if (!result.confirm || services !== miniServices() || !state.alive) return;
      await services.sync.lifecycle(id, 'purge', revision);
      if (services === miniServices() && state.alive) await this.refresh(true, true);
    } catch (error) { if (services === miniServices() && state.alive) this.setData({ issue: errorMessage(error, '永久删除失败，文章仍保留在回收站。') }); }
    finally { if (services === miniServices() && state.alive) this.setData({ deleting: false }); }
  },
  },
});
