import { miniServices } from './services';

App<AppOptions>({
  globalData: {
    launchAt: '',
  },
  onLaunch() {
    this.globalData.launchAt = new Date().toISOString();
    miniServices().auth.startBackground();
  },
});
