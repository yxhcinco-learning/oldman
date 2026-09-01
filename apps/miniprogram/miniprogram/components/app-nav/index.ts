Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  methods: {
    navigationFailed() {
      wx.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' });
    },
  },
});
