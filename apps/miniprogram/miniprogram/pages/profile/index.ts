import { miniServices } from '../../services';
import { selectTab, setTabBarHidden } from '../../ui/tab-bar';

Page({
  data: { menuOpen: false, busy: '', notice: '', error: '' },

  onShow() {
    selectTab(this, 2);
    if (this.data.menuOpen) setTabBarHidden(this, true);
  },

  openMenu() { setTabBarHidden(this, true); this.setData({ menuOpen: true, notice: '', error: '' }); },
  closeMenu() { this.setData({ menuOpen: false }); setTabBarHidden(this, false); },
  manageWorks() { setTabBarHidden(this, false); void wx.reLaunch({ url: '/pages/works/index?manage=1' }); },
  openRecycle() { setTabBarHidden(this, false); void wx.reLaunch({ url: '/pages/works/index?recycle=1' }); },

  onHide() {
    setTabBarHidden(this, false);
  },

  async exportBackup() {
    this.setData({ busy: '正在准备备份…', error: '', notice: '' });
    try {
      await miniServices().backups.exportAll();
      this.setData({ busy: '', notice: '已打开微信文件分享，请把 JSON 备份保存到你信任的位置。' });
    } catch (error) {
      this.setData({ busy: '', error: error instanceof Error ? error.message : '备份导出失败，请稍后重试。' });
    }
  },

  async importBackup() {
    this.setData({ busy: '正在校验备份…', error: '', notice: '' });
    try {
      const count = await miniServices().backups.chooseAndImport();
      this.setData({ busy: '', notice: count ? `已将 ${count} 篇作品作为新副本导入，没有覆盖本机原作品。` : '已取消选择。' });
    } catch (error) {
      this.setData({ busy: '', error: error instanceof Error ? error.message : '备份导入失败，本机原作品未改变。' });
    }
  },

  noop() {},
});
