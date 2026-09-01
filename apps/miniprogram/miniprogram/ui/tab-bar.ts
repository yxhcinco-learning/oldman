interface CustomTabBar {
  setData(data: { selected?: number; hidden?: boolean }): void;
}

interface TabPage {
  getTabBar?: () => CustomTabBar | undefined;
}

export function selectTab(page: object, selected: number) {
  const tabPage = page as TabPage;
  tabPage.getTabBar?.()?.setData({ selected, hidden: false });
}

export function setTabBarHidden(page: object, hidden: boolean) {
  const tabPage = page as TabPage;
  tabPage.getTabBar?.()?.setData({ hidden });
}
