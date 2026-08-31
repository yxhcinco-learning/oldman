import { describe, expect, it } from 'vitest';
import { MiniAiConsent, type MiniAiConsentPlatform } from '../miniprogram/privacy/ai-consent';

class FakeConsentPlatform implements MiniAiConsentPlatform {
  reads = 0;
  writes = 0;
  prompts = 0;
  constructor(private readonly stored: boolean, private readonly confirmed: boolean, private readonly writeFails = false) {}
  async read() { this.reads += 1; return this.stored; }
  async write() { this.writes += 1; if (this.writeFails) throw new Error('full'); }
  async confirm() { this.prompts += 1; return this.confirmed; }
}

describe('小程序 AI 知情确认', () => {
  it('已有同意时不弹窗，并在本轮复用', async () => {
    const platform = new FakeConsentPlatform(true, false);
    const consent = new MiniAiConsent(platform);
    expect(await consent.ensure()).toBe(true);
    expect(await consent.ensure()).toBe(true);
    expect(platform).toMatchObject({ reads: 1, prompts: 0, writes: 0 });
  });

  it('并发发送只显示一次说明并保存同意', async () => {
    const platform = new FakeConsentPlatform(false, true);
    const consent = new MiniAiConsent(platform);
    expect(await Promise.all([consent.ensure(), consent.ensure()])).toEqual([true, true]);
    expect(platform).toMatchObject({ reads: 1, prompts: 1, writes: 1 });
  });

  it('拒绝时不记忆同意，仍允许下次由用户重新选择', async () => {
    const platform = new FakeConsentPlatform(false, false);
    const consent = new MiniAiConsent(platform);
    expect(await consent.ensure()).toBe(false);
    expect(await consent.ensure()).toBe(false);
    expect(platform).toMatchObject({ prompts: 2, writes: 0 });
  });

  it('持久化失败时只在当前运行会话保留已明确同意', async () => {
    const platform = new FakeConsentPlatform(false, true, true);
    const consent = new MiniAiConsent(platform);
    expect(await consent.ensure()).toBe(true);
    expect(await consent.ensure()).toBe(true);
    expect(platform).toMatchObject({ reads: 1, prompts: 1, writes: 1 });
  });
});
