import { countWords, formatTime, type Work } from '../../domain/core';
import { miniServices } from '../../services';

interface WorkCard {
  id: string;
  title: string;
  meta: string;
  revision: number;
  deleted: boolean;
  initial: string;
}

function card(work: Work): WorkCard {
  return { id: work.id, title: work.title, initial: [...work.title][0] ?? '文', revision: work.revision, deleted: Boolean(work.deletedAt),
    meta: `${formatTime(work.updatedAt)} · ${countWords(work.segments)} 字 · 已保存到本机` };
}

Page({
  data: {
    loading: true,
    recycle: false,
    cards: [] as WorkCard[],
    visible: [] as WorkCard[],
    issue: '',
  },

  onShow() {
    void this.refresh();
  },

  async refresh() {
    try {
      const snapshot = await miniServices().repository.load();
      const cards = snapshot.works.map(card);
      this.setData({ loading: false, cards, visible: cards.filter(item => item.deleted === this.data.recycle),
        issue: snapshot.issues.map(item => item.message).join(' ') });
    } catch (error) {
      this.setData({ loading: false, issue: error instanceof Error ? error.message : '本机作品暂时无法读取。' });
    }
  },

  toggleRecycle() {
    const recycle = !this.data.recycle;
    this.setData({ recycle, visible: this.data.cards.filter(item => item.deleted === recycle) });
  },

  continueWriting(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    if (this.data.recycle) return;
    void wx.navigateTo({ url: `/pages/editor/index?id=${encodeURIComponent(id)}` });
  },

  async moveToRecycle(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    try { await miniServices().repository.setDeleted(id, true, revision); await this.refresh(); }
    catch (error) { this.setData({ issue: error instanceof Error ? error.message : '移入回收站失败。' }); }
  },

  async restore(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    try { await miniServices().repository.setDeleted(id, false, revision); await this.refresh(); }
    catch (error) { this.setData({ issue: error instanceof Error ? error.message : '恢复失败。' }); }
  },

  permanentlyDelete(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    const revision = Number(event.currentTarget.dataset.revision);
    wx.showModal({ title: '永久删除这篇作品？', content: '删除后只能通过你之前导出的备份恢复。其他作品不受影响。', confirmText: '永久删除', confirmColor: '#944924',
      success: result => {
        if (!result.confirm) return;
        void miniServices().repository.permanentlyDelete(id, revision).then(() => this.refresh()).catch(error => {
          this.setData({ issue: error instanceof Error ? error.message : '永久删除失败，作品仍保留在回收站。' });
        });
      } });
  },
});
