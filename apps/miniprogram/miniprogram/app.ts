App<AppOptions>({
  globalData: {
    launchAt: '',
  },
  onLaunch() {
    this.globalData.launchAt = new Date().toISOString();
  },
});
