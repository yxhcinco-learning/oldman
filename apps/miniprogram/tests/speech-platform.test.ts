import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WxMiniRecorder,
  WxMiniSpeechPermissions,
  WxMiniSpeechSocketFactory,
  WxMiniSpeechTicketPlatform,
  type MiniRecorderHandlers,
} from '../miniprogram/speech/session';

afterEach(() => vi.unstubAllGlobals());

describe('微信语音平台适配', () => {
  it('仅在显式调用时依次请求隐私与麦克风权限，并保留拒绝后的文字退路', async () => {
    const calls: string[] = [];
    vi.stubGlobal('wx', {
      requirePrivacyAuthorize: (options: { success(): void }) => { calls.push('privacy'); options.success(); },
      getSetting: (options: { success(result: { authSetting: Record<string, boolean> }): void }) => { calls.push('setting'); options.success({ authSetting: {} }); },
      authorize: (options: { scope: string; success(): void }) => { calls.push(options.scope); options.success(); },
    });
    const permissions = new WxMiniSpeechPermissions();
    expect(calls).toEqual([]);
    await permissions.ensure();
    expect(calls).toEqual(['privacy', 'setting', 'scope.record']);

    vi.stubGlobal('wx', {
      requirePrivacyAuthorize: (options: { fail(): void }) => options.fail(),
      getSetting: vi.fn(), authorize: vi.fn(),
    });
    await expect(new WxMiniSpeechPermissions().ensure()).rejects.toThrow('继续使用文字输入');
  });

  it('业务 token 只用于 HTTPS ticket 请求，WSS URL 只携带短时 ticket', async () => {
    const requestCalls: Array<Record<string, unknown>> = [];
    const socketCalls: Array<Record<string, unknown>> = [];
    const task = { onOpen: vi.fn(), onMessage: vi.fn(), onError: vi.fn(), onClose: vi.fn(), send: vi.fn(), close: vi.fn() };
    vi.stubGlobal('wx', {
      request: (options: { success(result: { statusCode: number; data: string }): void }) => {
        requestCalls.push(options as unknown as Record<string, unknown>);
        options.success({ statusCode: 200, data: '{"ticket":"short-ticket"}' });
      },
      connectSocket: (options: Record<string, unknown>) => { socketCalls.push(options); return task; },
    });
    await new WxMiniSpeechTicketPlatform('https://mini.example').issue('business-token');
    new WxMiniSpeechSocketFactory('https://mini.example').connect('speech-ticket'.padEnd(43, 'x'));
    expect(requestCalls[0]).toMatchObject({ url: 'https://mini.example/api/mini/speech-ticket', method: 'POST',
      data: {}, header: { Accept: 'application/json', Authorization: 'Bearer business-token', 'Content-Type': 'application/json' } });
    expect(socketCalls[0]?.url).toBe(`wss://mini.example/api/mini/speech?ticket=${'speech-ticket'.padEnd(43, 'x')}`);
    expect(String(socketCalls[0]?.url)).not.toContain('business-token');
  });

  it('RecorderManager 只输出PCM帧事件，不读取或保存 onStop 临时音频文件', () => {
    const listeners: Record<string, (...args: never[]) => void> = {};
    const manager = {
      onStart: (listener: () => void) => { listeners.start = listener; },
      onFrameRecorded: (listener: (result: { frameBuffer: ArrayBuffer; isLastFrame: boolean }) => void) => { listeners.frame = listener as (...args: never[]) => void; },
      onStop: (listener: () => void) => { listeners.stop = listener; },
      onError: (listener: () => void) => { listeners.error = listener; },
      onInterruptionBegin: (listener: () => void) => { listeners.interrupted = listener; },
      start: vi.fn(), stop: vi.fn(),
    };
    const adapter = new WxMiniRecorder(manager as unknown as WechatMiniprogram.RecorderManager);
    const handlers: MiniRecorderHandlers = { start: vi.fn(), frame: vi.fn(), stop: vi.fn(), error: vi.fn(), interrupted: vi.fn() };
    const options = { duration: 300_000, sampleRate: 16000 as const, numberOfChannels: 1 as const, format: 'PCM' as const, frameSize: 4 };
    adapter.start(options, handlers);
    expect(manager.start).toHaveBeenCalledWith(options);
    listeners.start?.();
    listeners.frame?.({ frameBuffer: new ArrayBuffer(4), isLastFrame: true } as never);
    listeners.stop?.({ tempFilePath: '/tmp/ignored.pcm' } as never);
    expect(handlers.start).toHaveBeenCalledOnce();
    expect(handlers.frame).toHaveBeenCalledWith(expect.any(ArrayBuffer), true);
    expect(handlers.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(handlers)).not.toContain('ignored.pcm');

    const rejected: MiniRecorderHandlers = { start: vi.fn(), frame: vi.fn(), stop: vi.fn(), error: vi.fn(), interrupted: vi.fn() };
    adapter.start(options, rejected);
    listeners.error?.({ errMsg: 'operateRecorder:fail bad request' } as never);
    expect(rejected.error).toHaveBeenCalledWith(expect.stringContaining('未接受录音参数'));
  });

  it('未真正开始录音前不获取 RecorderManager', () => {
    const getRecorderManager = vi.fn();
    vi.stubGlobal('wx', { getRecorderManager });
    new WxMiniRecorder();
    expect(getRecorderManager).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
