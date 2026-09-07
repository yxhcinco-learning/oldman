import { errorMessage } from '../../ui/error-message';
import { accountPage } from '../../auth/page';
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
}

function card(work: Work): WorkCard {
  return { id: work.id, title: work.title, revision: work.revision, deleted: Boolean(work.deletedAt),
    recovery: false, publication: '草稿', category: 'draft', published: false, meta: `${formatTime(work.updatedAt)} · ${countWords(work.segments)} 字` };
}

accountPage({
  observed: undefined as ReturnType<typeof miniServices> | undefined,
  unsubscribe: undefined as (() => void) | undefined,
  accountUnsubscribe: undefined as (() => void) | undefined,
  data: {
    loading: true,
    recycle: false,
    manage: false,
    filter: 'all',
    empty: false,
    total: 0,
    statusUnavailable: false,
    cards: [] as WorkCard[],
    visible: [] as WorkCard[],
    issue: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.accountUnsubscribe = miniServices().account.subscribe(() => { if (this.observed !== miniServices()) this.setData({ cards: [], visible: [], total: 0, empty: false, loading: true, statusUnavailable: false }); void this.refresh(false); });
    this.setData({ recycle: options.recycle === '1', manage: options.manage === '1' });
  },

  onShow() {
    void this.refresh();
  },

  onUnload() { this.unsubscribe?.(); this.accountUnsubscribe?.(); },

  async refresh(connect = true) {
    const services = miniServices();
    if (this.observed !== services) { this.unsubscribe?.(); this.observed = services; this.unsubscribe = services.sync.subscribe(() => { void this.refresh(false); }); }
    try {
      await services.writer.flush();
      let cloudIssue = '';
      if (connect) try { await services.sync.sync(); } catch (error) { cloudIssue = errorMessage(error, '云端尚未连接。'); }
      const snapshot = await services.repository.load();
      if (services !== miniServices()) return;
      let statuses: Awaited<ReturnType<typeof services.publications.statuses>> = { publications: [] };
      let statusKnown = true;
      try { statuses = await services.publications.statuses(); } catch { statusKnown = false; }
      if (services !== miniServices()) return;
      const cards = snapshot.works.map(work => { const aggregate = snapshot.aggregates?.find(item => item.work.id === work.id) ?? null;
        const status = statuses.publications.find(item => item.workId === work.id);
        const category: WorkCard['category'] = !statusKnown ? 'unknown' : status?.pending ? 'pending' : status?.published ? 'published' : 'draft';
        return { ...card(work), category, published: Boolean(status?.published), publication: statusKnown ? publicationLabel(status) : '发表状态暂未更新', recovery: Boolean(aggregate?.cloud?.recoveryOf) }; });
      this.setData({ loading: false, cards, statusUnavailable: !statusKnown,
        issue: cloudIssue || services.sync.snapshot().error || snapshot.issues.map(item => item.message).join(' ') });
      this.filterCards();
    } catch (error) {
      this.setData({ loading: false, issue: errorMessage(error, '本机作品暂时无法读取。') });
    }
  },

  toggleRecycle() {
    const recycle = !this.data.recycle;
    this.setData({ recycle, filter: 'all' }); this.filterCards();
  },

  finishManage() {
    this.setData({ manage: false }); this.filterCards();
  },

  filterCards() {
    const works = this.data.cards.filter(item => item.deleted === this.data.recycle);
    const visible = works.filter(item => this.data.recycle || this.data.filter === 'all' || (this.data.filter === 'published' ? item.published : item.category === this.data.filter));
    this.setData({ visible, total: works.length, empty: visible.length === 0 });
  },
  selectFilter(event: WechatMiniprogram.TouchEvent) {
    const filter = String(event.currentTarget.dataset.filter);
    if (!['all', 'draft', 'pending', 'published'].includes(filter)) return;
    this.setData({ filter }); this.filterCards();
  },

  manageArticles() { this.setData({ manage: true }); },
  toggleManage() { this.setData({ manage: !this.data.manage }); },
  publishArticle(event: WechatMiniprogram.TouchEvent) {
    void wx.navigateTo({ url: '/pages/publish/index?id=' + encodeURIComponent(String(event.currentTarget.dataset.id)) });
  },
  startWriting() {
    wx.navigateTo({ url: '/pages/editor/index', fail: error => {
      const issue = errorMessage(error, '写作页暂时无法打开，请重试。');
      this.setData({ issue });
      wx.showToast({ title: '写作页暂时无法打开，请重试', icon: 'none' });
    } });
  },

  continueWriting(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    if (this.data.recycle || this.data.manage) return;
    void wx.navigateTo({ url: `/pages/editor/index?id=${encodeURIComponent(id)}` });
  },

  async moveToRecycle(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    const result = await wx.showModal({ title: '移入回收站？', content: '待审核稿和已发表文章也会撤下，恢复作品后需要重新投稿。', confirmText: '移入回收站' });
    if (!result.confirm) return;
    try { await this.observed!.sync.lifecycle(id, 'trash', revision); await this.refresh(); }
    catch (error) { this.setData({ issue: errorMessage(error, '移入回收站失败。') }); }
  },

  async restore(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    try { await this.observed!.sync.lifecycle(id, 'restore', revision); await this.refresh(); }
    catch (error) { this.setData({ issue: errorMessage(error, '恢复失败。') }); }
  },

  viewRecovery(event: WechatMiniprogram.TouchEvent) {
    void wx.navigateTo({ url: '/pages/editor/index?id=' + encodeURIComponent(String(event.currentTarget.dataset.id)) });
  },
  async promoteRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = this.observed!;
    try { await services.repository.promoteRecovery(String(event.currentTarget.dataset.id)); await this.refresh(); }
    catch (error) { this.setData({ issue: errorMessage(error, '另存失败，恢复稿仍保留。') }); }
  },
  async exportRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = this.observed!;
    try { const item = await services.repository.getAggregate(String(event.currentTarget.dataset.id));
      if (item && services === miniServices()) await services.backups.rescue(item.work.draft, item.session, item.writingState);
    } catch (error) { this.setData({ issue: errorMessage(error, '恢复稿导出失败。') }); }
  },
  permanentlyDelete(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    const services = this.observed!;
    wx.showModal({ title: '永久删除这篇作品？', content: '删除后只能通过你之前导出的备份恢复。其他作品不受影响。', confirmText: '永久删除', confirmColor: '#944924',
      success: result => {
        if (!result.confirm || services !== miniServices()) return;
        void services.sync.lifecycle(id, 'purge', revision).then(() => this.refresh()).catch(error => {
          this.setData({ issue: errorMessage(error, '永久删除失败，作品仍保留在回收站。') });
        });
      } });
  },
});
