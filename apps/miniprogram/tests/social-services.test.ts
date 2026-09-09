import { afterEach, expect, it, vi } from 'vitest';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

it('领取失败后账号定期核对不持续重试，重新回到前台仍可再领取',async()=>{
  vi.resetModules();vi.useFakeTimers();
  vi.stubGlobal('wx',{env:{USER_DATA_PATH:'/test-user'},getFileSystemManager:()=>({})});
  const {WxAccountAdapter}=await import('../miniprogram/auth/account-client');
  const {MiniCloudSync}=await import('../miniprogram/sync/controller');
  const {MiniSocialClient}=await import('../miniprogram/social/client');
  const profile={id:'account-a',nickname:'',avatarVersion:0,hasAvatar:false,expiresAt:'2099-01-01T00:00:00.000Z'};
  vi.spyOn(WxAccountAdapter.prototype,'login').mockResolvedValue('code');
  vi.spyOn(WxAccountAdapter.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(WxAccountAdapter.prototype,'write').mockResolvedValue();
  vi.spyOn(WxAccountAdapter.prototype,'clear').mockResolvedValue();
  vi.spyOn(WxAccountAdapter.prototype,'request').mockImplementation(async path=>({statusCode:200,data:path.endsWith('/login')?{token:'a'.repeat(43),account:profile}:profile}));
  vi.spyOn(MiniCloudSync.prototype,'sync').mockResolvedValue();
  const claim=vi.spyOn(MiniSocialClient.prototype,'claim').mockRejectedValue(new Error('暂时无法领取'));
  const services=await import('../miniprogram/services');
  await services.miniServices().account.login();
  expect(claim).toHaveBeenCalledTimes(1);
  await services.refreshMiniAccount();await services.refreshMiniAccount();
  expect(claim).toHaveBeenCalledTimes(1);
  services.resumeMiniServices();await vi.advanceTimersByTimeAsync(0);
  expect(claim).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(90_000);
  expect(claim).toHaveBeenCalledTimes(2);
  services.pauseMiniServices();
  services.resumeMiniServices();await vi.advanceTimersByTimeAsync(0);
  expect(claim).toHaveBeenCalledTimes(3);
  services.pauseMiniServices();
});
