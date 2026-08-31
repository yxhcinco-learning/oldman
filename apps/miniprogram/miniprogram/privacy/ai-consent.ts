export const MINI_AI_CONSENT_KEY = 'suiyue.mini.ai-consent.v1';

export interface MiniAiConsentPlatform {
  read(): Promise<boolean>;
  write(): Promise<void>;
  confirm(): Promise<boolean>;
}

export class MiniAiConsent {
  private acceptedForSession = false;
  private inFlight?: Promise<boolean>;

  constructor(private readonly platform: MiniAiConsentPlatform) {}

  ensure(): Promise<boolean> {
    if (this.acceptedForSession) return Promise.resolve(true);
    this.inFlight ??= this.check().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async check() {
    if (await this.platform.read()) {
      this.acceptedForSession = true;
      return true;
    }
    if (!await this.platform.confirm()) return false;
    this.acceptedForSession = true;
    await this.platform.write().catch(() => undefined);
    return true;
  }
}

export class WxMiniAiConsentPlatform implements MiniAiConsentPlatform {
  read(): Promise<boolean> {
    return new Promise(resolve => wx.getStorage<{ accepted: true; version: 1 }>({ key: MINI_AI_CONSENT_KEY,
      success: result => resolve(result.data?.accepted === true && result.data.version === 1), fail: () => resolve(false) }));
  }

  write(): Promise<void> {
    return new Promise((resolve, reject) => wx.setStorage({ key: MINI_AI_CONSENT_KEY, data: { accepted: true, version: 1 },
      success: () => resolve(), fail: reject }));
  }

  confirm(): Promise<boolean> {
    return new Promise(resolve => wx.showModal({ title: '发送给小文前，请您了解',
      content: '发送后，当前标题、正文、相关修改记录、对话，以及本轮需要的话题背景和采访回答会经岁月有声服务发送给 DeepSeek。AI 可能出错，结果会标明来源并需您核对；本机写作仍可继续。',
      confirmText: '同意发送', cancelText: '暂不使用', success: result => resolve(result.confirm), fail: () => resolve(false) }));
  }
}
