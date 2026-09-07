import { navigationMetrics } from '../../ui/navigation';

Component({
  properties: { title: String, dark: Boolean, interceptBack: Boolean, fallback: { type: String, value: '/pages/profile/index' } },
  data: navigationMetrics(),
  pageLifetimes: { resize() { this.setData(navigationMetrics()); } },
  methods: {
    back() {
      if (this.properties.interceptBack) { this.triggerEvent('back'); return; }
      if (getCurrentPages().length > 1) void wx.navigateBack({ fail: () => { void wx.switchTab({ url: this.properties.fallback }); } });
      else void wx.switchTab({ url: this.properties.fallback });
    },
  },
});
