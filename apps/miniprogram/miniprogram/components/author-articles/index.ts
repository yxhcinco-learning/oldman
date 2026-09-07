import { errorMessage } from '../../ui/error-message';
import { authorArticleAction } from '../../publication/presentation';
import type { OwnSubmission } from '../../publication/client';
import { countWords, formatTime, publicationLabel, type Work } from '../../domain/core';
import { miniServices } from '../../services';

interface WorkCard {
  id: string;
  title: string;
  meta: string;
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
  return { id: work.id, title: work.title, action: '编辑文章', url: '/pages/editor/index?id=' + encodeURIComponent(work.id), revision: work.revision, deleted: Boolean(work.deletedAt),
    recovery: false, publication: '草稿', category: 'draft', published: false, meta: `${formatTime(work.updatedAt)} · ${countWords(work.segments)} 字` };
}

type Services = ReturnType<typeof miniServices>;
interface LibraryState { services?: Services; unsubscribe?: () => void; accountUnsubscribe?: () => void; alive: boolean; sequence: number;
  snapshot?: Awaited<ReturnType<Services['repository']['load']>>; statuses: Awaited<ReturnType<Services['publications']['statuses']>>['publications'];
  submissions: Map<string, Promise<OwnSubmission>> }
const states = new WeakMap<object, LibraryState>();
function context(instance: object) { let state = states.get(instance); if (!state) { state = { alive: true, sequence: 0, statuses: [], submissions: new Map() }; states.set(instance, state); } return state; }
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { recycle: Boolean, embedded: Boolean },
  data: { loading: true, manage: false, filter: 'all', empty: false, total: 0, limit: 20, hasMore: false,
    statusUnavailable: false, cards: [] as WorkCard[], visible: [] as WorkCard[], issue: '', deleting: false },
  lifetimes: {
    attached() {
      const state = context(this); state.alive = true;
      state.accountUnsubscribe = miniServices().account.subscribe(() => { if (state.services !== miniServices()) {
        this.setData({ cards: [], visible: [], total: 0, empty: false, loading: true, manage: false }); state.submissions.clear();
      } void this.refresh(false); });
      void this.refresh();
    },
    detached() { const state = context(this); state.alive = false; state.sequence++; state.unsubscribe?.(); state.accountUnsubscribe?.(); },
  },
  pageLifetimes: { show() { void this.refresh(); } },
  methods: {
  async refresh(connect = true) {
    const state = context(this), sequence = ++state.sequence;
    const services = miniServices();
    if (context(this).services !== services) { context(this).unsubscribe?.(); context(this).services = services; context(this).unsubscribe = services.sync.subscribe(() => { void this.refresh(false); }); }
    try {
      await services.writer.flush();
      let cloudIssue = '';
      if (connect) try { await services.sync.sync(); } catch (error) { cloudIssue = errorMessage(error, '云端尚未连接。'); }
      const snapshot = await services.repository.load();
      if (services !== miniServices() || !state.alive || sequence !== state.sequence) return;
      let statuses: Awaited<ReturnType<typeof services.publications.statuses>> = { publications: [] };
      let statusKnown = true;
      try { statuses = await services.publications.statuses(); } catch { statusKnown = false; }
      if (services !== miniServices() || !state.alive || sequence !== state.sequence) return;
      state.snapshot = snapshot; state.statuses = statuses.publications;
      const cards = snapshot.works.map(work => { const aggregate = snapshot.aggregates?.find(item => item.work.id === work.id) ?? null;
        const status = statuses.publications.find(item => item.workId === work.id);
        const category: WorkCard['category'] = !statusKnown ? 'unknown' : status?.pending ? 'pending' : status?.published ? 'published' : 'draft';
        return { ...card(work), ...authorArticleAction(work, aggregate?.session, status), category, published: Boolean(status?.published), publication: statusKnown ? publicationLabel(status) : '发表状态暂未更新', recovery: Boolean(aggregate?.cloud?.recoveryOf) }; });
      this.setData({ loading: false, cards, statusUnavailable: !statusKnown,
        issue: cloudIssue || services.sync.snapshot().error || snapshot.issues.map(item => item.message).join(' ') });
      this.filterCards();
    } catch (error) {
      if (state.alive && services === miniServices() && sequence === state.sequence) this.setData({ loading: false, issue: errorMessage(error, '本机作品暂时无法读取。') });
    }
  },

  filterCards() {
    const works = this.data.cards.filter(item => item.deleted === this.data.recycle);
    const matching = works.filter(item => this.data.recycle || this.data.filter === 'all' || (this.data.filter === 'published' ? item.published : item.category === this.data.filter));
    this.setData({ visible: matching.slice(0, this.data.limit), total: works.length, empty: matching.length === 0, hasMore: matching.length > this.data.limit });
    void this.updateVisibleActions();
  },
  more() { this.setData({ limit: this.data.limit + 20 }); this.filterCards(); },
  async updateVisibleActions() {
    const state = context(this), services = state.services, sequence = state.sequence;
    if (!services || this.data.recycle) return;
    const pending = this.data.visible.filter(item => item.published && item.category !== 'pending');
    for (let offset = 0; offset < pending.length; offset += 4) await Promise.all(pending.slice(offset, offset + 4).map(async item => {
      const status = state.statuses.find(p => p.workId === item.id), aggregate = state.snapshot?.aggregates?.find(a => a.work.id === item.id);
      if (!status?.lastSubmission || status.lastSubmission.state !== 'approved' || !aggregate) return;
      try {
        const id = status.lastSubmission.id;
        if (!state.submissions.has(id)) state.submissions.set(id, services.publications.submission(item.id, id));
        const submitted = await state.submissions.get(id)!;
        const local = await services.publicationStorage.load(item.id);
        if (!state.alive || sequence !== state.sequence || services !== miniServices()) return;
        const action = authorArticleAction(aggregate.work, aggregate.session, status, submitted, local.dirty);
        const update = { ...item, ...action, publication: action.changed ? '已发表 · 有未提交修改' : item.publication };
        this.setData({ cards: this.data.cards.map(c => c.id === item.id ? update : c), visible: this.data.visible.map(c => c.id === item.id ? update : c) });
      } catch {
        state.submissions.delete(status.lastSubmission.id);
        if (state.alive && sequence === state.sequence && services === miniServices()) this.setData({ visible: this.data.visible.map(c => c.id === item.id ? { ...c, action: '编辑文章', url: '/pages/editor/index?id=' + encodeURIComponent(c.id) } : c) });
      }
    }));
  },
  selectFilter(event: WechatMiniprogram.TouchEvent) {
    const filter = String(event.currentTarget.dataset.filter);
    if (!['all', 'draft', 'pending', 'published'].includes(filter)) return;
    this.setData({ filter, limit: 20 }); this.filterCards();
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
    if (this.data.recycle || this.data.manage) return;
    const item = this.data.visible.find(c => c.id === String(event.currentTarget.dataset.id));
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
      await this.refresh();
    } catch (error) { if (services === miniServices() && context(this).alive) this.setData({ issue: errorMessage(error, '删除未完成，请重试。') }); }
    finally { if (context(this).alive && services === miniServices()) this.setData({ deleting: false }); }
  },
  async restore(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    try { await context(this).services!.sync.lifecycle(id, 'restore', revision); await this.refresh(); }
    catch (error) { this.setData({ issue: errorMessage(error, '恢复失败。') }); }
  },

  viewRecovery(event: WechatMiniprogram.TouchEvent) {
    void wx.navigateTo({ url: '/pages/editor/index?id=' + encodeURIComponent(String(event.currentTarget.dataset.id)) });
  },
  async promoteRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = context(this).services!;
    try { await services.repository.promoteRecovery(String(event.currentTarget.dataset.id)); await this.refresh(); }
    catch (error) { this.setData({ issue: errorMessage(error, '另存失败，恢复稿仍保留。') }); }
  },
  async exportRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = context(this).services!;
    try { const item = await services.repository.getAggregate(String(event.currentTarget.dataset.id));
      if (item && services === miniServices()) await services.backups.rescue(item.work.draft, item.session, item.writingState);
    } catch (error) { this.setData({ issue: errorMessage(error, '恢复稿导出失败。') }); }
  },
  permanentlyDelete(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    const services = context(this).services!;
    wx.showModal({ title: '永久删除这篇作品？', content: '删除后只能通过你之前导出的备份恢复。其他作品不受影响。', confirmText: '永久删除', confirmColor: '#944924',
      success: result => {
        if (!result.confirm || services !== miniServices()) return;
        void services.sync.lifecycle(id, 'purge', revision).then(() => this.refresh()).catch(error => {
          this.setData({ issue: errorMessage(error, '永久删除失败，作品仍保留在回收站。') });
        });
      } });
  },
  },
});
