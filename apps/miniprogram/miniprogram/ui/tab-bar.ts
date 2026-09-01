interface CustomTabBar {
  setData(data: { selected: number }): void;
}

interface TabPage {
  getTabBar?: () => CustomTabBar | undefined;
}

export function selectTab(page: object, selected: number) {
  const tabPage = page as TabPage;
  tabPage.getTabBar?.()?.setData({ selected });
}
