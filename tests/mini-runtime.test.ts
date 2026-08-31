// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadMiniIdentityRuntime } from '../server/mini-runtime';

const valid = {
  WECHAT_MINIPROGRAM_APP_ID: 'wx1234567890abcdef',
  WECHAT_MINIPROGRAM_APP_SECRET: 'a'.repeat(32),
  SUIYUE_AUTH_DB_PATH: '/var/lib/suiyue-yousheng/auth.sqlite',
};

describe('微信小程序身份运行配置', () => {
  it('只有三项均有效时才启用在线身份', () => {
    expect(loadMiniIdentityRuntime(valid)).toEqual({ configuration: {
      appId: valid.WECHAT_MINIPROGRAM_APP_ID,
      appSecret: valid.WECHAT_MINIPROGRAM_APP_SECRET,
      databasePath: valid.SUIYUE_AUTH_DB_PATH,
    } });
  });

  it.each([
    {},
    { WECHAT_MINIPROGRAM_APP_ID: valid.WECHAT_MINIPROGRAM_APP_ID },
    { ...valid, WECHAT_MINIPROGRAM_APP_ID: 'invalid' },
    { ...valid, WECHAT_MINIPROGRAM_APP_SECRET: 'short' },
    { ...valid, SUIYUE_AUTH_DB_PATH: 'relative/auth.sqlite' },
  ])('缺失或无效配置失败关闭且不回显字段值', env => {
    const result = loadMiniIdentityRuntime(env);
    expect(result.configuration).toBeUndefined();
    const visible = JSON.stringify(result);
    expect(visible).not.toContain(valid.WECHAT_MINIPROGRAM_APP_ID);
    expect(visible).not.toContain(valid.WECHAT_MINIPROGRAM_APP_SECRET);
    expect(visible).not.toContain(valid.SUIYUE_AUTH_DB_PATH);
  });
});
