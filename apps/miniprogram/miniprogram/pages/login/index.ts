import { miniServices, loginMiniAccount, refreshMiniAccount } from '../../services';
import { cancelLogin, finishLogin } from '../../auth/navigation';

Page({
  visible: true,
  visibilityVersion: 0,
  data: { contextual: false, busy: false, error: '', signedIn: false, reason: '' },
  onLoad(options: Record<string, string | undefined>) {
    const state = miniServices().account.snapshot();
    this.setData({ contextual: options.return === '1', signedIn: state.status === 'authenticated',
      reason: state.status === 'replaced' ? '账号已在其他设备登录，您可以在这里继续。' : state.status === 'expired' ? '登录已过期，请重新登录。' : '' });
  },
  onShow() { this.visible = true; },
  onHide() { this.visible = false; this.visibilityVersion++; },
  onUnload() { this.visible = false; this.visibilityVersion++; },
  async login() {
    if (this.data.busy) return;
    const version = this.visibilityVersion;
    this.setData({ busy: true, error: '' });
    try {
      await miniServices().account.restore();
      if (!this.visible || version !== this.visibilityVersion) return;
      const state = miniServices().account.snapshot();
      if (state.status === 'authenticated') await miniServices().sync.sync();
      else if (state.status === 'offline' && state.account) await refreshMiniAccount();
      else await loginMiniAccount();
      await finishLogin(() => this.visible && version === this.visibilityVersion);
    } catch (error) {
      if (this.visible && version === this.visibilityVersion) this.setData({ error: error instanceof Error ? error.message : '微信登录未成功，请重试。' });
    } finally {
      const state = miniServices().account.snapshot();
      this.setData({ busy: false, signedIn: state.status === 'authenticated' || state.status === 'offline' && Boolean(state.account) });
    }
  },
  skip() {
    if (this.data.busy) return;
    void cancelLogin();
  },
  openPrivacy() { void wx.navigateTo({ url: '/pages/privacy/index' }); },
});
