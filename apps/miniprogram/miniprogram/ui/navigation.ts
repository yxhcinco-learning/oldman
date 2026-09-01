export interface NavigationMetrics {
  statusBarHeight: number;
  navigationHeight: number;
  navigationBarHeight: number;
  menuReserve: number;
}

export function navigationMetrics(): NavigationMetrics {
  const windowInfo = wx.getWindowInfo();
  const statusBarHeight = windowInfo.statusBarHeight || 20;
  let menu: WechatMiniprogram.ClientRect | undefined;
  try { menu = wx.getMenuButtonBoundingClientRect(); } catch { menu = undefined; }
  const menuTop = menu?.top || statusBarHeight + 4;
  const menuHeight = menu?.height || 32;
  const navigationBarHeight = menuHeight + Math.max(4, menuTop - statusBarHeight) * 2;
  const menuReserve = menu ? Math.max(88, windowInfo.windowWidth - menu.left + 8) : 96;
  return { statusBarHeight, navigationBarHeight, navigationHeight: statusBarHeight + navigationBarHeight, menuReserve };
}
