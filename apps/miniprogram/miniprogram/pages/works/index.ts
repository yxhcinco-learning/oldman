import { accountPage } from '../../auth/page';
accountPage({
  data: { recycle: false },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ recycle: options.recycle === '1' });
    if (options.recycle !== '1') void wx.switchTab({ url: '/pages/profile/index' });
  },
});
