import { navigationMetrics } from '../../ui/navigation';

Component({
  properties: { title: String, fallback: { type: String, value: '/pages/profile/index' } },
  data: navigationMetrics(),
  pageLifetimes: { resize() { this.setData(navigationMetrics()); } },
  methods: {
    back() {
      if (getCurrentPages().length > 1) void wx.navigateBack({ fail: () => { void wx.switchTab({ url: this.properties.fallback }); } });
      else void wx.switchTab({ url: this.properties.fallback });
    },
  },
});
