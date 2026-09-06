import { writingAccess } from '../../sync/writing-access';
import { countWords, formatTime, type Work } from '../../domain/core';
import { miniServices } from '../../services';
import { selectTab } from '../../ui/tab-bar';

interface WorkCard {
  id: string;
  title: string;
  meta: string;
  revision: number;
  deleted: boolean;
  initial: string;
  cover: string;
  recovery: boolean;
  saveLabel: string;
}

function card(work: Work): WorkCard {
  const cover = ['bike', 'home', 'train'][[...work.id].reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % 3];
  return { id: work.id, title: work.title, initial: [...work.title][0] ?? '文', revision: work.revision, deleted: Boolean(work.deletedAt),
    recovery: false, saveLabel: '本机已保存',
    cover: `/assets/story-${cover}.svg`, meta: `${formatTime(work.updatedAt)} · ${countWords(work.segments)} 字` };
}

Page({
  observed: undefined as ReturnType<typeof miniServices> | undefined,
  unsubscribe: undefined as (() => void) | undefined,
  accountUnsubscribe: undefined as (() => void) | undefined,
  data: {
    loading: true,
    recycle: false,
    manage: false,
    cards: [] as WorkCard[],
    visible: [] as WorkCard[],
    issue: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.accountUnsubscribe = miniServices().account.subscribe(() => { if (this.observed !== miniServices()) this.setData({ cards: [], visible: [] }); void this.refresh(false); });
    this.setData({ recycle: options.recycle === '1', manage: options.manage === '1' });
  },

  onShow() {
    selectTab(this, 1);
    void this.refresh();
  },

  onUnload() { this.unsubscribe?.(); this.accountUnsubscribe?.(); },

  async refresh(connect = true) {
    const services = miniServices();
    if (this.observed !== services) { this.unsubscribe?.(); this.observed = services; this.unsubscribe = services.sync.subscribe(() => { void this.refresh(false); }); }
    try {
      await services.writer.flush();
      let cloudIssue = '';
      if (connect) try { await services.sync.sync(); } catch (error) { cloudIssue = error instanceof Error ? error.message : '云端尚未连接。'; }
      const snapshot = await services.repository.load();
      if (services !== miniServices()) return;
      const cards = snapshot.works.map(work => { const aggregate = snapshot.aggregates?.find(item => item.work.id === work.id) ?? null;
        return { ...card(work), recovery: Boolean(aggregate?.cloud?.recoveryOf), saveLabel: writingAccess(aggregate, services.account.snapshot(), services.sync).syncLabel }; });
      this.setData({ loading: false, cards, visible: cards.filter(item => item.deleted === this.data.recycle),
        issue: cloudIssue || services.sync.snapshot().error || snapshot.issues.map(item => item.message).join(' ') });
    } catch (error) {
      this.setData({ loading: false, issue: error instanceof Error ? error.message : '本机作品暂时无法读取。' });
    }
  },

  toggleRecycle() {
    const recycle = !this.data.recycle;
    this.setData({ recycle, visible: this.data.cards.filter(item => item.deleted === recycle) });
  },

  finishManage() {
    void wx.reLaunch({ url: '/pages/works/index' });
  },

  startWriting() {
    wx.navigateTo({ url: '/pages/editor/index', fail: error => {
      const issue = error.errMsg || '写作页暂时无法打开，请重试。';
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
    try { await this.observed!.sync.lifecycle(id, 'trash', revision); await this.refresh(); }
    catch (error) { this.setData({ issue: error instanceof Error ? error.message : '移入回收站失败。' }); }
  },

  async restore(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    try { await this.observed!.sync.lifecycle(id, 'restore', revision); await this.refresh(); }
    catch (error) { this.setData({ issue: error instanceof Error ? error.message : '恢复失败。' }); }
  },

  viewRecovery(event: WechatMiniprogram.TouchEvent) {
    void wx.navigateTo({ url: '/pages/editor/index?id=' + encodeURIComponent(String(event.currentTarget.dataset.id)) });
  },
  async promoteRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = this.observed!;
    try { await services.repository.promoteRecovery(String(event.currentTarget.dataset.id)); await this.refresh(); }
    catch (error) { this.setData({ issue: error instanceof Error ? error.message : '另存失败，恢复稿仍保留。' }); }
  },
  async exportRecovery(event: WechatMiniprogram.TouchEvent) {
    const services = this.observed!;
    try { const item = await services.repository.getAggregate(String(event.currentTarget.dataset.id));
      if (item && services === miniServices()) await services.backups.rescue(item.work.draft, item.session, item.writingState);
    } catch (error) { this.setData({ issue: error instanceof Error ? error.message : '恢复稿导出失败。' }); }
  },
  permanentlyDelete(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    const services = this.observed!;
    wx.showModal({ title: '永久删除这篇作品？', content: '删除后只能通过你之前导出的备份恢复。其他作品不受影响。', confirmText: '永久删除', confirmColor: '#944924',
      success: result => {
        if (!result.confirm || services !== miniServices()) return;
        void services.sync.lifecycle(id, 'purge', revision).then(() => this.refresh()).catch(error => {
          this.setData({ issue: error instanceof Error ? error.message : '永久删除失败，作品仍保留在回收站。' });
        });
      } });
  },
});
