Page({
  data: { error: '' },
  openContract() {
    wx.openPrivacyContract({ fail: () => this.setData({ error: '微信隐私保护指引暂时无法打开，请稍后重试。' }) });
  },
});
