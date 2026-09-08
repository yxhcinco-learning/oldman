import { afterEach, describe, expect, it, vi } from 'vitest';

interface PrivacyPage {
  back(): void;
}

afterEach(() => { vi.unstubAllGlobals(); });

async function fixture() {
  vi.resetModules();
  let page!: PrivacyPage;
  vi.stubGlobal('Page', (definition: PrivacyPage) => { page = definition; });
  const navigateBack = vi.fn();
  const reLaunch = vi.fn();
  vi.stubGlobal('wx', { navigateBack, reLaunch });
  await import('../miniprogram/pages/privacy/index');
  return { page, navigateBack, reLaunch };
}

describe('隐私说明返回导航', () => {
  it('从登录或个人资料打开后，返回原页面而不重置来源', async () => {
    const { page, navigateBack, reLaunch } = await fixture();
    page.back();
    expect(navigateBack).toHaveBeenCalledOnce();
    expect(reLaunch).not.toHaveBeenCalled();
  });

  it('没有可返回页面时恢复开屏账号判断，不直接进入私有页面', async () => {
    const { page, navigateBack, reLaunch } = await fixture();
    navigateBack.mockImplementation((options: WechatMiniprogram.NavigateBackOption) => options.fail?.({ errMsg: 'navigateBack:fail cannot navigate back at first page' }));
    page.back();
    expect(reLaunch).toHaveBeenCalledExactlyOnceWith({ url: '/pages/launch/index' });
  });
});
