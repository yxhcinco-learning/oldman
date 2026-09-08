Page({
  data: { error: '' },
  back() {
    // Privacy is also reachable before login; a missing return stack must restore the account gate.
    wx.navigateBack({ fail: () => { void wx.reLaunch({ url: '/pages/launch/index' }); } });
  },
  openContract() {
    wx.openPrivacyContract({ fail: () => this.setData({ error: '微信隐私保护指引暂时无法打开，请稍后重试。' }) });
  },
});
