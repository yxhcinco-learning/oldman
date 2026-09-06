import { miniServices } from '../../services';
import { clearLoginReturn } from '../../auth/navigation';

Page({
  alive: true,
  onLoad() { this.alive = true; clearLoginReturn(); void this.enter(); },
  async enter() {
    const account = miniServices().account;
    // Restoration can be offline; never hold the opening screen on a network request.
    await Promise.all([
      new Promise(resolve => setTimeout(resolve, 500)),
      Promise.race([account.restore(), new Promise(resolve => setTimeout(resolve, 1200))]),
    ]);
    if (!this.alive) return;
    const state = account.snapshot();
    const signedIn = state.account && ['authenticated', 'offline'].includes(state.status);
    void wx.reLaunch({ url: signedIn ? '/pages/home/index' : '/pages/login/index' });
  },
  onUnload() { this.alive = false; },
});
