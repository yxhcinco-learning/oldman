import { isAbsolute, posix, win32 } from 'node:path';
import { MiniIdentityStore } from './mini-identity-store';
import { WechatAuthService, WechatCode2SessionTransport, type WechatMiniConfiguration } from './wechat-auth';

export interface MiniIdentityRuntimeConfiguration extends WechatMiniConfiguration {
  databasePath: string;
}

export interface MiniIdentityRuntimeLoad {
  configuration?: MiniIdentityRuntimeConfiguration;
  problem?: string;
}

const present = (value: string | undefined) => Boolean(value?.trim());
const absolutePath = (value: string) => isAbsolute(value) || posix.isAbsolute(value) || win32.isAbsolute(value);

export function loadMiniIdentityRuntime(env: Readonly<Record<string, string | undefined>> = process.env): MiniIdentityRuntimeLoad {
  const values = {
    appId: env.WECHAT_MINIPROGRAM_APP_ID?.trim() ?? '',
    appSecret: env.WECHAT_MINIPROGRAM_APP_SECRET?.trim() ?? '',
    databasePath: env.SUIYUE_AUTH_DB_PATH?.trim() ?? '',
  };
  const configuredFields = [values.appId, values.appSecret, values.databasePath].filter(value => present(value)).length;
  if (configuredFields === 0) return { problem: '微信小程序身份未配置，本地写作和网页能力仍可使用。' };
  if (configuredFields !== 3) return { problem: '微信小程序身份配置不完整，在线身份已关闭。' };
  if (!/^wx[A-Za-z0-9]{8,30}$/.test(values.appId) || !/^[A-Za-z0-9]{16,256}$/.test(values.appSecret) ||
      !absolutePath(values.databasePath) || /[\u0000-\u001f\u007f]/.test(values.databasePath)) {
    return { problem: '微信小程序身份配置无效，在线身份已关闭。' };
  }
  return { configuration: values };
}

export function createMiniIdentityRuntime(configuration: MiniIdentityRuntimeConfiguration) {
  const store = new MiniIdentityStore({ path: configuration.databasePath });
  const transport = new WechatCode2SessionTransport(configuration);
  return { service: new WechatAuthService(configuration, store, transport), close: () => store.close() };
}
