import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniAuthClient, type MiniAuthPlatform, type MiniAuthTokenStore, type StoredMiniSession } from '../miniprogram/auth/client';
import {
  HoldToDictate,
  MiniSpeechSession,
  MiniSpeechTicketClient,
  type MiniRecorder,
  type MiniRecorderHandlers,
  type MiniSpeechPermissions,
  type MiniSpeechSocket,
  type MiniSpeechSocketFactory,
  type MiniSpeechTicketPlatform,
} from '../miniprogram/speech/session';

class Permissions implements MiniSpeechPermissions {
  calls = 0;
  gate: Promise<void> = Promise.resolve();
  ensure() { this.calls += 1; return this.gate; }
}

class Socket implements MiniSpeechSocket {
  open?: () => void;
  message?: (data: string | ArrayBuffer) => void;
  error?: () => void;
  closed?: () => void;
  sent: Array<string | Uint8Array> = [];
  closeCalls = 0;
  onOpen(listener: () => void) { this.open = listener; }
  onMessage(listener: (data: string | ArrayBuffer) => void) { this.message = listener; }
  onError(listener: () => void) { this.error = listener; }
  onClose(listener: () => void) { this.closed = listener; }
  async sendBinary(data: ArrayBuffer) { this.sent.push(new Uint8Array(data)); }
  async sendText(data: string) { this.sent.push(data); }
  close() { this.closeCalls += 1; }
  event(value: unknown) { this.message?.(JSON.stringify(value)); }
}

class Sockets implements MiniSpeechSocketFactory {
  tickets: string[] = [];
  sockets: Socket[] = [];
  connect(ticket: string) { const socket = new Socket(); this.tickets.push(ticket); this.sockets.push(socket); return socket; }
}

class Recorder implements MiniRecorder {
  options?: { duration: number; sampleRate: 16000; numberOfChannels: 1; format: 'PCM'; frameSize: number };
  handlers: MiniRecorderHandlers[] = [];
  stopCalls = 0;
  start(options: { duration: number; sampleRate: 16000; numberOfChannels: 1; format: 'PCM'; frameSize: number }, handlers: MiniRecorderHandlers) {
    this.options = options;
    this.handlers.push(handlers);
  }
  stop() { this.stopCalls += 1; }
  current() { return this.handlers.at(-1)!; }
}

const create = (overrides: { permissions?: Permissions; tickets?: { issue(): Promise<string> }; sockets?: Sockets; recorder?: Recorder; now?: () => number } = {}) => {
  const permissions = overrides.permissions ?? new Permissions();
  const tickets = overrides.tickets ?? { issue: async () => 'speech_ticket'.padEnd(43, 'x') };
  const sockets = overrides.sockets ?? new Sockets();
  const recorder = overrides.recorder ?? new Recorder();
  const session = new MiniSpeechSession({ permissions, tickets, sockets, recorder, now: overrides.now });
  return { session, permissions, tickets, sockets, recorder };
};

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('小程序实时听写会话', () => {
  it('等待服务 ready 后用16k单声道PCM录音，合并奇数分片并先发末帧再发 end', async () => {
    let now = 1000;
    const value = create({ now: () => now });
    const committed: string[] = [];
    await value.session.start(text => committed.push(text));
    const socket = value.sockets.sockets[0]!;
    socket.open?.();
    socket.event({ type: 'ready' });
    expect(value.recorder.options).toEqual({ duration: 300_000, sampleRate: 16000, numberOfChannels: 1, format: 'PCM', frameSize: 4 });
    value.recorder.current().start();
    expect(value.session.state.phase).toBe('recording');
    value.recorder.current().frame(Uint8Array.from([1, 2, 3]).buffer, false);
    value.recorder.current().frame(Uint8Array.from([4, 5, 6]).buffer, true);
    socket.event({ type: 'transcript', text: '这是口述文字。', final: true });
    now += 1200;
    await value.session.stop();
    value.recorder.current().stop();
    await vi.waitFor(() => expect(socket.sent).toHaveLength(3));
    expect([...socket.sent[0] as Uint8Array, ...socket.sent[1] as Uint8Array]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(socket.sent[2]).toBe('{"type":"end"}');
    expect(value.session.state.level).toBe(0);
    socket.event({ type: 'done' });
    expect(committed).toEqual(['这是口述文字。']);
    expect(value.session.state.phase).toBe('idle');
  });

  it('长按后在权限或连接尚未准备好时松手会取消，不会迟到启动录音', async () => {
    let release: () => void = () => {};
    const permissions = new Permissions();
    permissions.gate = new Promise(resolve => { release = resolve; });
    const value = create({ permissions });
    const pending = value.session.start(() => { throw new Error('不应提交'); });
    expect(value.session.state.phase).toBe('permission');
    await value.session.stop();
    expect(value.session.state.phase).toBe('idle');
    release();
    await pending;
    expect(value.sockets.sockets).toHaveLength(0);
    expect(value.recorder.handlers).toHaveLength(0);
  });

  it('显式取消丢弃文字并隔离迟到的 recorder/socket 事件', async () => {
    const value = create();
    const committed: string[] = [];
    await value.session.start(text => committed.push(text));
    const socket = value.sockets.sockets[0]!;
    socket.event({ type: 'ready' });
    const oldHandlers = value.recorder.current();
    oldHandlers.start();
    socket.event({ type: 'transcript', text: '不应留下', final: false });
    value.session.cancel();
    expect(value.recorder.stopCalls).toBe(1);
    expect(socket.sent).toContain('{"type":"cancel"}');
    socket.event({ type: 'done' });
    oldHandlers.frame(Uint8Array.from([1, 2]).buffer, true);
    oldHandlers.stop();
    expect(committed).toEqual([]);
    expect(value.session.state).toMatchObject({ phase: 'idle', text: '' });
  });

  it('权限拒绝、Socket失败和系统中断都保留文字输入退路', async () => {
    const denied = new Permissions();
    denied.gate = Promise.reject(new Error('麦克风未获允许，请继续使用文字输入。'));
    const deniedValue = create({ permissions: denied });
    await deniedValue.session.start(() => {});
    expect(deniedValue.session.state).toMatchObject({ phase: 'error', message: '麦克风未获允许，请继续使用文字输入。' });

    const failed = create();
    const committed: string[] = [];
    await failed.session.start(text => committed.push(text));
    const failedSocket = failed.sockets.sockets[0]!;
    failedSocket.event({ type: 'ready' });
    failed.recorder.current().start();
    failedSocket.event({ type: 'transcript', text: '已经识别的部分', final: false });
    failedSocket.error?.();
    expect(committed).toEqual(['已经识别的部分']);
    expect(failed.session.state.phase).toBe('error');

    const interrupted = create();
    const interruptionText: string[] = [];
    await interrupted.session.start(text => interruptionText.push(text));
    interrupted.sockets.sockets[0]!.event({ type: 'ready' });
    interrupted.recorder.current().start();
    interrupted.sockets.sockets[0]!.event({ type: 'transcript', text: '中断前文字', final: true });
    interrupted.recorder.current().interrupted();
    expect(interruptionText).toEqual(['中断前文字']);
    expect(interrupted.recorder.stopCalls).toBe(1);
  });

  it('页面隐藏会停止资源并把已有转写交给输入框，不保存音频', async () => {
    const value = create();
    const committed: string[] = [];
    await value.session.start(text => committed.push(text));
    const socket = value.sockets.sockets[0]!;
    socket.event({ type: 'ready' });
    value.recorder.current().start();
    socket.event({ type: 'transcript', text: '切后台前的文字', final: true });
    value.session.interrupt();
    expect(committed).toEqual(['切后台前的文字']);
    expect(value.recorder.stopCalls).toBe(1);
    expect(socket.closeCalls).toBe(1);
    expect(value.session.state.phase).toBe('error');
  });

  it('持续替换临时转写，并在发送队列超过256 KiB时停止录音保留文字', async () => {
    class SlowSocket extends Socket {
      override sendBinary() { return new Promise<void>(() => {}); }
    }
    class SlowSockets extends Sockets {
      override connect(ticket: string) { const socket = new SlowSocket(); this.tickets.push(ticket); this.sockets.push(socket); return socket; }
    }
    const sockets = new SlowSockets();
    const value = create({ sockets });
    const committed: string[] = [];
    await value.session.start(text => committed.push(text));
    const socket = sockets.sockets[0]!;
    socket.event({ type: 'ready' });
    value.recorder.current().start();
    socket.event({ type: 'transcript', text: '临时文字', final: false });
    expect(value.session.state.text).toBe('临时文字');
    socket.event({ type: 'transcript', text: '最终文字', final: true });
    expect(value.session.state.text).toBe('最终文字');
    for (let index = 0; index < 65; index++) value.recorder.current().frame(new ArrayBuffer(4096), false);
    expect(value.session.state).toMatchObject({ phase: 'error', message: expect.stringContaining('网络较慢') });
    expect(committed).toEqual(['最终文字']);
    expect(value.recorder.stopCalls).toBe(1);
  });
});

describe('长按语音手势', () => {
  it('短按不请求权限，达到阈值才启动，松手停止且取消手势丢弃', () => {
    vi.useFakeTimers();
    const gesture = new HoldToDictate();
    const start = vi.fn(); const stop = vi.fn(); const cancel = vi.fn();
    gesture.press(start); vi.advanceTimersByTime(179); gesture.release(stop);
    expect(start).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
    gesture.press(start); vi.advanceTimersByTime(180); expect(start).toHaveBeenCalledOnce(); gesture.release(stop); expect(stop).toHaveBeenCalledOnce();
    gesture.press(start); vi.advanceTimersByTime(180); gesture.cancel(cancel); expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('语音 ticket 客户端', () => {
  it('通过业务会话申请，401时只恢复一次并严格校验60秒凭据', async () => {
    class Auth implements MiniAuthPlatform {
      calls = 0;
      async login() { this.calls += 1; return `code-${this.calls}`; }
      async exchange() { return { statusCode: 200, data: { token: `business_${this.calls}`.padEnd(43, 'x'), expiresAt: new Date(3_700_000).toISOString() } }; }
    }
    class Tokens implements MiniAuthTokenStore {
      value?: StoredMiniSession;
      async read() { return this.value; }
      async write(value: StoredMiniSession) { this.value = value; }
      async clear() { this.value = undefined; }
    }
    const authPlatform = new Auth();
    const auth = new MiniAuthClient(authPlatform, new Tokens(), () => 100_000);
    const calls: string[] = [];
    const platform: MiniSpeechTicketPlatform = {
      async issue(businessToken) {
        calls.push(businessToken);
        if (calls.length === 1) return { statusCode: 401, data: {} };
        return { statusCode: 200, data: { ticket: 'ticket'.padEnd(43, 'x'), expiresAt: new Date(160_000).toISOString() } };
      },
    };
    await expect(new MiniSpeechTicketClient(auth, platform, () => 100_000).issue()).resolves.toBe('ticket'.padEnd(43, 'x'));
    expect(authPlatform.calls).toBe(2);
    expect(calls).toEqual(['business_1'.padEnd(43, 'x'), 'business_2'.padEnd(43, 'x')]);
  });
});
