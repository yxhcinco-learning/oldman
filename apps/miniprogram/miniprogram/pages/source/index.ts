Page({
  data: { url: '', error: '' },
  onLoad(options: Record<string, string | undefined>) {
    const url = options.url ? decodeURIComponent(options.url) : '';
    const title = options.title ? decodeURIComponent(options.title) : '信息来源';
    wx.setNavigationBarTitle({ title: title.slice(0, 20) });
    if (!/^https:\/\//i.test(url)) this.setData({ error: '该来源不是可在微信内打开的 HTTPS 地址。' });
    else this.setData({ url });
  },
});
