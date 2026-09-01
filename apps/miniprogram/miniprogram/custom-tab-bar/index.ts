interface TabItem {
  pagePath: string;
  text: string;
  iconPath: string;
}

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index', text: '热门', iconPath: '/assets/spark.svg' },
      { pagePath: '/pages/works/index', text: '文章', iconPath: '/assets/pen.svg' },
      { pagePath: '/pages/profile/index', text: '我的', iconPath: '/assets/book.svg' },
    ] as TabItem[],
  },

  methods: {
    switchTab(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      void wx.switchTab({
        url: item.pagePath,
        fail: () => wx.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' }),
      });
    },
  },
});
