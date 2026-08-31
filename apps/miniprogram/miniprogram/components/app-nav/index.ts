Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  methods: {
    createArticle() {
      void wx.navigateTo({ url: '/pages/editor/index' });
    },
    open(event: WechatMiniprogram.TouchEvent) {
      const target = event.currentTarget.dataset.target as 'home' | 'works' | 'profile';
      const routes = { home: '/pages/home/index', works: '/pages/works/index', profile: '/pages/profile/index' };
      if (target === this.data.active) return;
      void wx.reLaunch({ url: routes[target] });
    },
  },
});
