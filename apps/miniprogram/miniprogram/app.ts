import { registerMiniNetwork, resumeMiniServices, pauseMiniServices } from './services';

App<AppOptions>({
  globalData: {
    launchAt: '',
  },
  onLaunch() {
    this.globalData.launchAt = new Date().toISOString();
    registerMiniNetwork();
  },
  onShow() { resumeMiniServices(); },
  onHide() { pauseMiniServices(); },
});
