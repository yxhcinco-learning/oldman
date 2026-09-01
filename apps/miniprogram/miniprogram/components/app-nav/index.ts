Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  methods: {
    navigate(event: WechatMiniprogram.TouchEvent) {
      const url = String(event.currentTarget.dataset.url || '');
      if (!url) return;
      void wx.reLaunch({ url, fail: () => this.navigationFailed() });
    },
    navigationFailed() {
      wx.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' });
    },
  },
});
