import { accountPage } from '../../auth/page';
accountPage({
  data: { recycle: false },
  onLoad(options: Record<string, string | undefined>) { this.setData({ recycle: options.recycle === '1' }); },
  openRecycle() { void wx.navigateTo({ url: '/pages/works/index?recycle=1' }); },
  onReachBottom() { this.selectComponent('.author-articles')?.more(); },
  async onPullDownRefresh() { try { await this.selectComponent('.author-articles')?.refresh(); } finally { void wx.stopPullDownRefresh(); } },
});
