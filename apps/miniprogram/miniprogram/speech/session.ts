import type { SpeechEvent } from '../domain/core';
import type { AuthenticatedMiniResponse } from '../auth/client';
import type { MiniSessionAuthorizer } from '../auth/account-client';
import { MINI_API_ORIGIN } from '../network/config';

export type MiniSpeechPhase = 'idle' | 'permission' | 'starting' | 'ticket' | 'connecting' | 'recording' | 'finishing' | 'error';

export interface MiniSpeechState {
  phase: MiniSpeechPhase;
  text: string;
  level: number;
  elapsed: number;
  message: string;
}

export interface MiniSpeechPermissions { ensure(): Promise<void> }

export interface MiniSpeechTicketPlatform {
  issue(token: string): Promise<AuthenticatedMiniResponse<unknown>>;
}

export interface MiniSpeechTickets { issue(): Promise<string> }

export interface MiniSpeechSocket {
  onOpen(listener: () => void): void;
  onMessage(listener: (data: string | ArrayBuffer) => void): void;
  onError(listener: () => void): void;
  onClose(listener: () => void): void;
  sendBinary(data: ArrayBuffer): Promise<void>;
  sendText(data: string): Promise<void>;
  close(): void;
}

export interface MiniSpeechSocketFactory { connect(ticket: string): MiniSpeechSocket }

export interface MiniRecorderHandlers {
  start(): void;
  frame(data: ArrayBuffer, last: boolean): void;
  stop(): void;
  error(message?: string): void;
  interrupted(): void;
}

export interface MiniRecorder {
  start(options: { duration: number; sampleRate: 16000; numberOfChannels: 1; format: 'PCM'; frameSize: number }, handlers: MiniRecorderHandlers): void;
  stop(): void;
}

export interface MiniSpeechDependencies {
  permissions: MiniSpeechPermissions;
  tickets: MiniSpeechTickets;
  sockets: MiniSpeechSocketFactory;
  recorder: MiniRecorder;
  now?: () => number;
}

const idleState = (): MiniSpeechState => ({ phase: 'idle', text: '', level: 0, elapsed: 0, message: '' });
const validTicket = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43,256}$/.test(value);

export class MiniSpeechTicketClient {
  constructor(private readonly auth: MiniSessionAuthorizer, private readonly platform: MiniSpeechTicketPlatform, private readonly now: () => number = Date.now) {}

  async issue() {
    const response = await this.auth.authorizedRequest(token => this.platform.issue(token));
    if (response.statusCode < 200 || response.statusCode >= 300 || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      const payload = response.data && typeof response.data === 'object' ? response.data as { error?: unknown } : undefined;
      throw new Error(typeof payload?.error === 'string' && payload.error.length <= 300 ? payload.error : '语音准备暂不可用，请继续使用文字输入。');
    }
    const payload = response.data as { ticket?: unknown; expiresAt?: unknown };
    const expiresAt = typeof payload.expiresAt === 'string' ? Date.parse(payload.expiresAt) : Number.NaN;
    if (!validTicket(payload.ticket) || !Number.isFinite(expiresAt) || expiresAt <= this.now() || expiresAt > this.now() + 65_000) {
      throw new Error('语音连接凭据无法核对，请重试。');
    }
    return payload.ticket;
  }
}

function pcmLevel(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const sampleBytes = bytes.byteLength - bytes.byteLength % 2;
  if (!sampleBytes) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleBytes);
  let total = 0;
  for (let offset = 0; offset < sampleBytes; offset += 2) {
    const value = view.getInt16(offset, true) / 32768;
    total += value * value;
  }
  return Math.min(1, Math.sqrt(total / (sampleBytes / 2)) * 2.5);
}

export class MiniSpeechSession {
  state: MiniSpeechState = idleState();
  private readonly listeners = new Set<(state: MiniSpeechState) => void>();
  private readonly now: () => number;
  private epoch = 0;
  private socket?: MiniSpeechSocket;
  private recorderActive = false;
  private recorderStarted = false;
  private recorderStopped = false;
  private serviceReady = false;
  private commit?: (text: string) => void;
  private startedAt = 0;
  private ticker?: ReturnType<typeof setInterval>;
  private prepareTimer?: ReturnType<typeof setTimeout>;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private queuedBytes = 0;
  private pendingByte: number | undefined;
  private audioQueue: ArrayBuffer[] = [];
  private draining = false;
  private endSent = false;
  private limited = false;

  constructor(private readonly dependencies: MiniSpeechDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  subscribe(listener: (state: MiniSpeechState) => void) {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private patch(next: Partial<MiniSpeechState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener({ ...this.state });
  }

  private clearTimers() {
    if (this.prepareTimer !== undefined) clearTimeout(this.prepareTimer);
    if (this.finishTimer !== undefined) clearTimeout(this.finishTimer);
    if (this.ticker !== undefined) clearInterval(this.ticker);
    this.prepareTimer = undefined;
    this.finishTimer = undefined;
    this.ticker = undefined;
  }

  async start(commit: (text: string) => void) {
    if (!['idle', 'error'].includes(this.state.phase)) return;
    const epoch = ++this.epoch;
    this.commit = commit;
    this.pendingByte = undefined;
    this.queuedBytes = 0;
    this.audioQueue = [];
    this.draining = false;
    this.recorderStarted = false;
    this.recorderStopped = false;
    this.serviceReady = false;
    this.endSent = false;
    this.limited = false;
    this.patch({ phase: 'permission', text: '', level: 0, elapsed: 0, message: '正在确认麦克风权限…' });
    this.prepareTimer = setTimeout(() => this.fail(epoch, '等待授权或连接超时，请继续使用文字输入。'), 30_000);
    try {
      await this.dependencies.permissions.ensure();
      if (epoch !== this.epoch) return;
      this.patch({ phase: 'starting', message: '麦克风启动中，请稍候…' });
      if (this.prepareTimer !== undefined) clearTimeout(this.prepareTimer);
      this.prepareTimer = setTimeout(() => this.fail(epoch, '语音启动超时，未识别的部分请重新说。'), 8000);
      this.recorderActive = true;
      this.dependencies.recorder.start({ duration: 300_000, sampleRate: 16000, numberOfChannels: 1, format: 'PCM', frameSize: 4 }, {
        start: () => this.onRecorderStart(epoch),
        frame: frame => this.onRecorderFrame(epoch, frame),
        stop: () => this.onRecorderStop(epoch),
        error: message => this.fail(epoch, message || '麦克风录音失败，未识别的部分请重新说。'),
        interrupted: () => this.fail(epoch, '录音被系统中断，未识别的部分请重新说。'),
      });
      if (epoch !== this.epoch) return;
      const ticket = await this.dependencies.tickets.issue();
      if (epoch !== this.epoch) return;
      const socket = this.dependencies.sockets.connect(ticket);
      this.socket = socket;
      socket.onMessage(data => this.onSocketMessage(epoch, data));
      socket.onError(() => this.fail(epoch, '无法连接语音服务，未识别的部分请重新说。'));
      socket.onClose(() => { if (epoch === this.epoch && !['idle', 'error'].includes(this.state.phase)) this.fail(epoch, '语音连接中断，未识别的部分请重新说。'); });
    } catch (error) {
      if (epoch === this.epoch) this.fail(epoch, error instanceof Error ? error.message : '无法使用语音输入，请继续使用文字输入。');
    }
  }

  private onSocketMessage(epoch: number, data: string | ArrayBuffer) {
    if (epoch !== this.epoch || typeof data !== 'string' || data.length > 16 * 1024) return this.fail(epoch, '语音服务返回的数据无法核对，已收到的文字会放入输入框。');
    let event: SpeechEvent;
    try { event = JSON.parse(data) as SpeechEvent; }
    catch { return this.fail(epoch, '语音服务返回的数据无法核对，已收到的文字会放入输入框。'); }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return this.fail(epoch, '语音服务返回的数据无法核对，已收到的文字会放入输入框。');
    if (event.type === 'ready') {
      if (this.serviceReady) return;
      this.serviceReady = true;
      if (this.recorderStarted && this.prepareTimer !== undefined) clearTimeout(this.prepareTimer);
      if (this.state.phase === 'recording') this.patch({ message: '正在听，松开结束' });
      this.beginFinishWait(epoch);
      void this.drainAudio(epoch);
      return;
    }
    if (event.type === 'transcript' && typeof event.text === 'string' && typeof event.final === 'boolean' && event.text.length <= 12_000) {
      this.patch({ text: event.text });
      return;
    }
    if (event.type === 'limit') { this.limited = true; void this.stop(); return; }
    if (event.type === 'error' && typeof event.message === 'string') { this.fail(epoch, event.message.slice(0, 300)); return; }
    if (event.type === 'done' && this.state.phase === 'finishing' && (this.endSent || this.limited)) { this.complete(epoch); return; }
    this.fail(epoch, '语音服务返回的数据无法核对，已收到的文字会放入输入框。');
  }

  private onRecorderStart(epoch: number) {
    if (epoch !== this.epoch || this.recorderStarted || this.recorderStopped) return;
    this.recorderStarted = true;
    if (this.serviceReady && this.prepareTimer !== undefined) clearTimeout(this.prepareTimer);
    this.startedAt = this.now();
    this.patch({ phase: 'recording', message: this.serviceReady ? '正在听，松开结束' : '正在听，文字稍后出现' });
    this.ticker = setInterval(() => {
      if (epoch !== this.epoch) return;
      const elapsed = Math.min(300, Math.floor((this.now() - this.startedAt) / 1000));
      this.patch({ elapsed });
      if (elapsed >= 300) void this.stop();
    }, 250);
  }

  private onRecorderFrame(epoch: number, frame: ArrayBuffer) {
    if (epoch !== this.epoch || this.recorderStopped || !['recording', 'finishing'].includes(this.state.phase)) return;
    const incoming = new Uint8Array(frame);
    const combined = new Uint8Array(incoming.byteLength + (this.pendingByte === undefined ? 0 : 1));
    let offset = 0;
    if (this.pendingByte !== undefined) { combined[0] = this.pendingByte; offset = 1; }
    combined.set(incoming, offset);
    const evenLength = combined.byteLength - combined.byteLength % 2;
    this.pendingByte = evenLength < combined.byteLength ? combined[combined.byteLength - 1] : undefined;
    if (this.state.phase === 'recording' && evenLength) this.patch({ level: pcmLevel(combined.slice(0, evenLength).buffer) });
    if (!evenLength) return;
    const outgoing = combined.slice(0, evenLength).buffer;
    this.queuedBytes += outgoing.byteLength;
    if (this.queuedBytes > 256 * 1024) { this.fail(epoch, '网络较慢，未识别的部分请分段重新说。'); return; }
    this.audioQueue.push(outgoing);
    void this.drainAudio(epoch);
  }

  private async drainAudio(epoch: number) {
    if (epoch !== this.epoch || this.draining || !this.serviceReady || !this.socket) return;
    const socket = this.socket;
    this.draining = true;
    try {
      while (epoch === this.epoch && this.audioQueue.length) {
        const frame = this.audioQueue.shift()!;
        await socket.sendBinary(frame);
        if (epoch !== this.epoch) return;
        this.queuedBytes -= frame.byteLength;
      }
      if (epoch === this.epoch && this.recorderStopped && !this.endSent) {
        this.endSent = true;
        await socket.sendText(JSON.stringify({ type: 'end' }));
      }
    } catch { this.fail(epoch, '语音发送失败，未识别的部分请重新说。'); }
    finally { if (epoch === this.epoch) this.draining = false; }
  }

  private beginFinishWait(epoch: number) {
    if (!this.recorderStopped || !this.serviceReady || this.finishTimer !== undefined) return;
    this.patch({ message: '正在识别刚才的话，请稍候…' });
    // Covers the gateway's bounded 8.2s audio queue plus its 10s recognition finish.
    this.finishTimer = setTimeout(() => this.fail(epoch, '识别收尾超时，未识别的部分请重新说。'), 22_000);
  }

  private onRecorderStop(epoch: number) {
    if (epoch !== this.epoch || this.recorderStopped) return;
    this.recorderActive = false;
    this.recorderStopped = true;
    if (!this.recorderStarted) { this.fail(epoch, '麦克风未能开始录音，请重新按住说话。'); return; }
    if (this.ticker !== undefined) clearInterval(this.ticker);
    if (this.finishTimer !== undefined) clearTimeout(this.finishTimer);
    this.finishTimer = undefined;
    this.pendingByte = undefined;
    this.patch({ phase: 'finishing', level: 0, message: '正在识别刚才的话，请稍候…' });
    this.beginFinishWait(epoch);
    void this.drainAudio(epoch);
  }

  async stop() {
    if (['permission', 'starting', 'ticket', 'connecting'].includes(this.state.phase)) { this.cancel(); return; }
    if (this.state.phase !== 'recording') return;
    if (this.ticker !== undefined) clearInterval(this.ticker);
    const epoch = this.epoch;
    this.patch({ phase: 'finishing', level: 0, message: '正在识别刚才的话，请稍候…' });
    this.finishTimer = setTimeout(() => this.fail(epoch, '麦克风收尾超时，未识别的部分请重新说。'), 3000);
    try { this.dependencies.recorder.stop(); }
    catch { this.fail(this.epoch, '麦克风收尾失败，已收到的文字会放入输入框。'); }
  }

  cancel() {
    if (this.state.phase === 'idle') return;
    const socket = this.socket;
    ++this.epoch;
    this.clearTimers();
    if (this.recorderActive) {
      this.recorderActive = false;
      try { this.dependencies.recorder.stop(); } catch { /* Ignore late recorder cleanup. */ }
    }
    if (socket) {
      void socket.sendText(JSON.stringify({ type: 'cancel' })).catch(() => undefined);
      socket.close();
    }
    this.socket = undefined;
    this.commit = undefined;
    this.pendingByte = undefined;
    this.audioQueue = [];
    this.queuedBytes = 0;
    this.patch(idleState());
  }

  interrupt(message = '页面已切换，录音已停止；已收到的文字会放入输入框。') {
    if (!['idle', 'error'].includes(this.state.phase)) this.fail(this.epoch, message);
  }

  private complete(epoch: number) {
    if (epoch !== this.epoch) return;
    const text = this.state.text.trim();
    const commit = this.commit;
    ++this.epoch;
    this.clearTimers();
    if (this.recorderActive) {
      this.recorderActive = false;
      try { this.dependencies.recorder.stop(); } catch { /* The service duration limit can finish before native onStop. */ }
    }
    this.socket?.close();
    this.socket = undefined;
    this.commit = undefined;
    this.audioQueue = [];
    this.queuedBytes = 0;
    this.pendingByte = undefined;
    if (text) commit?.(text);
    this.patch({ ...idleState(), message: text ? '' : '这次没有识别到文字，可以再说一次。' });
  }

  private fail(epoch: number, message: string) {
    if (epoch !== this.epoch) return;
    const text = this.state.text.trim();
    const commit = this.commit;
    ++this.epoch;
    this.clearTimers();
    if (this.recorderActive) {
      this.recorderActive = false;
      try { this.dependencies.recorder.stop(); } catch { /* Ignore cleanup errors. */ }
    }
    this.socket?.close();
    this.socket = undefined;
    this.commit = undefined;
    this.audioQueue = [];
    this.queuedBytes = 0;
    this.pendingByte = undefined;
    if (text) commit?.(text);
    this.patch({ phase: 'error', text, level: 0, message });
  }
}

export class HoldToDictate {
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;
  constructor(private readonly delayMs = 180) {}
  press(start: () => void) {
    this.reset();
    this.timer = setTimeout(() => { this.timer = undefined; this.started = true; start(); }, this.delayMs);
  }
  release(stop: () => void) {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; return; }
    if (this.started) { this.started = false; stop(); }
  }
  cancel(cancel: () => void) {
    const active = this.started;
    this.reset();
    if (active) cancel();
  }
  reset() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; this.started = false; }
}

export class WxMiniSpeechPermissions implements MiniSpeechPermissions {
  async ensure() {
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      await new Promise<void>((resolve, reject) => wx.requirePrivacyAuthorize({
        success: () => resolve(),
        fail: () => reject(new Error('需要同意语音隐私说明后才能录音；也可以继续使用文字输入。')),
      }));
    }
    const granted = await new Promise<boolean>((resolve, reject) => wx.getSetting({
      success: result => resolve(Boolean(result.authSetting['scope.record'])),
      fail: () => reject(new Error('无法读取麦克风权限，请继续使用文字输入。')),
    }));
    if (granted) return;
    await new Promise<void>((resolve, reject) => wx.authorize({
      scope: 'scope.record',
      success: () => resolve(),
      fail: () => reject(new Error('麦克风未获允许，请在小程序设置中开启，或继续使用文字输入。')),
    }));
  }
}

export class WxMiniSpeechTicketPlatform implements MiniSpeechTicketPlatform {
  constructor(private readonly origin = MINI_API_ORIGIN) {}
  issue(token: string): Promise<AuthenticatedMiniResponse<unknown>> {
    return new Promise((resolve, reject) => wx.request({
      url: `${this.origin}/api/mini/speech-ticket`, method: 'POST', timeout: 8000, dataType: '其他', responseType: 'text',
      data: {},
      header: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      success: result => {
        if (typeof result.data !== 'string' || result.data.length > 16 * 1024) { reject(new Error('语音准备响应无法核对，请重试。')); return; }
        try { resolve({ statusCode: result.statusCode, data: JSON.parse(result.data) as unknown }); }
        catch { reject(new Error('语音准备响应无法核对，请重试。')); }
      },
      fail: error => reject(new Error(/timeout/i.test(error.errMsg) ? '语音准备超时，请继续使用文字输入。' : '当前无法连接语音服务，请继续使用文字输入。')),
    }));
  }
}

class WxMiniSpeechSocket implements MiniSpeechSocket {
  constructor(private readonly task: WechatMiniprogram.SocketTask) {}
  onOpen(listener: () => void) { this.task.onOpen(listener); }
  onMessage(listener: (data: string | ArrayBuffer) => void) { this.task.onMessage(result => listener(result.data)); }
  onError(listener: () => void) { this.task.onError(listener); }
  onClose(listener: () => void) { this.task.onClose(listener); }
  sendBinary(data: ArrayBuffer) { return this.send(data); }
  sendText(data: string) { return this.send(data); }
  private send(data: string | ArrayBuffer) {
    return new Promise<void>((resolve, reject) => this.task.send({ data, success: () => resolve(), fail: () => reject(new Error('socket send failed')) }));
  }
  close() { this.task.close({ code: 1000, reason: 'Completed' }); }
}

export class WxMiniSpeechSocketFactory implements MiniSpeechSocketFactory {
  constructor(private readonly origin = MINI_API_ORIGIN) {}
  connect(ticket: string) {
    const socketOrigin = this.origin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    return new WxMiniSpeechSocket(wx.connectSocket({ url: `${socketOrigin}/api/mini/speech?ticket=${encodeURIComponent(ticket)}`, timeout: 10_000, tcpNoDelay: true }));
  }
}

export class WxMiniRecorder implements MiniRecorder {
  private handlers?: MiniRecorderHandlers;
  private manager?: WechatMiniprogram.RecorderManager;
  private stopRequested = false;
  constructor(manager?: WechatMiniprogram.RecorderManager) {
    if (manager) this.bind(manager);
  }
  private bind(manager: WechatMiniprogram.RecorderManager) {
    this.manager = manager;
    manager.onStart(() => {
      // stop() can precede the native onStart callback. Stop again once capture
      // really starts, rather than leaving a cancelled microphone running.
      if (this.stopRequested || !this.handlers) { manager.stop(); return; }
      this.handlers.start();
    });
    manager.onFrameRecorded(result => this.handlers?.frame(result.frameBuffer, result.isLastFrame));
    manager.onStop(() => { const handlers = this.handlers; this.handlers = undefined; this.stopRequested = false; handlers?.stop(); });
    manager.onError(error => {
      const handlers = this.handlers;
      this.handlers = undefined;
      this.stopRequested = false;
      const detail = typeof error.errMsg === 'string' ? error.errMsg : '';
      const message = /bad request|parameter|invalid/i.test(detail)
        ? '手机暂未接受录音参数，请重试，或继续使用文字输入。'
        : /permission|auth|denied/i.test(detail)
          ? '麦克风未获允许，请在小程序设置中开启，或继续使用文字输入。'
          : '麦克风录音失败，已收到的文字会放入输入框。';
      handlers?.error(message);
    });
    manager.onInterruptionBegin(() => this.handlers?.interrupted());
  }
  private ensureManager() {
    if (!this.manager) this.bind(wx.getRecorderManager());
    return this.manager as WechatMiniprogram.RecorderManager;
  }
  start(options: { duration: number; sampleRate: 16000; numberOfChannels: 1; format: 'PCM'; frameSize: number }, handlers: MiniRecorderHandlers) {
    if (this.handlers) throw new Error('麦克风还在收尾，请稍后重新按住说话。');
    this.stopRequested = false;
    this.handlers = handlers;
    try { this.ensureManager().start(options); }
    catch (error) { this.handlers = undefined; this.stopRequested = false; throw error; }
  }
  stop() { if (this.handlers) this.stopRequested = true; this.manager?.stop(); }
}
