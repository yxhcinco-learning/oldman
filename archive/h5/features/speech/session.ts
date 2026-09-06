import { capturePcm, type AudioCapture } from './capture';
import type { SpeechEvent } from './protocol';

export type Phase = 'idle' | 'permission' | 'connecting' | 'recording' | 'finishing' | 'error';
export interface SpeechState { phase: Phase; text: string; elapsed: number; level: number; message: string }
export interface SpeechDependencies {
  status(signal: AbortSignal): Promise<boolean>;
  media(): Promise<MediaStream>;
  socket(): WebSocket;
  capture(stream: MediaStream, frame: (data: ArrayBuffer) => void, level: (value: number) => void): Promise<AudioCapture>;
}
const browserDependencies: SpeechDependencies = {
  async status(signal) { const response = await fetch('/api/speech/status', { signal }); if (!response.ok) throw new Error('本地语音网关未启动，请运行 npm run dev'); const data = await response.json() as { configured?: boolean }; return Boolean(data.configured); },
  media: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }),
  socket: () => new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/speech`),
  capture: capturePcm,
};
export class SpeechSession {
  state: SpeechState = { phase: 'idle', text: '', elapsed: 0, level: 0, message: '' };
  private epoch = 0;
  private stream?: MediaStream;
  private audio?: AudioCapture;
  private socket?: WebSocket;
  private abort?: AbortController;
  private ticker?: ReturnType<typeof setInterval>;
  private timeout?: ReturnType<typeof setTimeout>;
  constructor(private onChange: (state: SpeechState) => void, private deps: SpeechDependencies = browserDependencies) {}
  private patch(next: Partial<SpeechState>) { this.state = { ...this.state, ...next }; this.onChange(this.state); }
  private async release() {
    clearTimeout(this.timeout); clearInterval(this.ticker);
    this.abort?.abort(); this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
    const audio = this.audio; this.audio = undefined;
    // Tracks are already stopped; a browser AudioContext close failure must not
    // prevent socket cleanup or discard an otherwise usable transcript.
    try { await audio?.stop(); } catch { /* Best-effort audio graph cleanup. */ }
  }
  private fail(message: string) {
    this.epoch++; void this.release(); this.socket?.close(); this.socket = undefined;
    this.patch({ phase: 'error', level: 0, message });
  }
  async start() {
    if (!['idle', 'error'].includes(this.state.phase)) return;
    const epoch = ++this.epoch;
    this.patch({ phase: 'permission', text: '', elapsed: 0, level: 0, message: '正在准备麦克风…' });
    this.abort = new AbortController();
    this.timeout = setTimeout(() => this.fail('等待连接或授权超时，请重试'), 30_000);
    try {
      if (!await this.deps.status(this.abort.signal)) throw new Error('尚未配置腾讯云凭据，请按本地配置指引设置后再试');
      if (epoch !== this.epoch) return;
      const stream = await this.deps.media();
      if (epoch !== this.epoch) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.patch({ phase: 'connecting', message: '正在连接识别服务…' });
      const socket = this.deps.socket(); this.socket = socket;
      let started = false;
      socket.onmessage = async ({ data }) => {
        if (epoch !== this.epoch) return;
        try {
          const event = JSON.parse(data) as SpeechEvent;
          if (event.type === 'error') { this.fail(event.message); return; }
          if (event.type === 'ready' && !started) {
            started = true;
            const audio = await this.deps.capture(stream, frame => {
              if (epoch !== this.epoch || socket.readyState !== 1) return;
              if (socket.bufferedAmount > 128 * 1024) { this.fail('网络较慢，已收到的文字已保留，请分段再说'); return; }
              socket.send(frame);
            }, level => { if (epoch === this.epoch) this.patch({ level }); });
            if (epoch !== this.epoch) { await audio.stop(); return; }
            this.audio = audio; clearTimeout(this.timeout);
            this.patch({ phase: 'recording', message: '' });
            const start = Date.now();
            this.ticker = setInterval(() => { this.patch({ elapsed: Math.floor((Date.now() - start) / 1000) }); if (this.state.elapsed >= 300) void this.stop(); }, 250);
          } else if (event.type === 'transcript' && typeof event.text === 'string') {
            this.patch({ text: event.text });
          } else if (event.type === 'limit') { void this.stop(); }
          else if (event.type === 'done') {
            this.epoch++; void this.release(); socket.close(); this.socket = undefined;
            this.patch({ phase: 'idle', level: 0, message: this.state.text ? '' : '这次没有识别到文字，可以再说一次' });
          }
        } catch { if (epoch === this.epoch) this.fail('语音数据处理失败，已收到的文字已保留'); }
      };
      socket.onerror = () => { if (epoch === this.epoch) this.fail('无法连接语音服务，请检查配置和网络'); };
      socket.onclose = () => { if (epoch === this.epoch) this.fail('语音连接中断，已收到的文字已保留'); };
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.fail(error instanceof DOMException && error.name === 'NotAllowedError' ? '麦克风未获允许，请在浏览器设置中开启权限' : error instanceof Error ? error.message : '无法使用麦克风，请切换文字输入');
    }
  }
  async stop() {
    if (this.state.phase === 'permission' || this.state.phase === 'connecting') { this.cancel(); return; }
    if (this.state.phase !== 'recording') return;
    const epoch = this.epoch;
    this.patch({ phase: 'finishing', level: 0, message: '正在确认最后几个字…' });
    await this.release();
    if (epoch !== this.epoch) return;
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({ type: 'end' }));
      this.timeout = setTimeout(() => this.fail('识别收尾超时，已收到的文字已保留'), 12000);
    } else this.fail('连接已经断开，已收到的文字已保留');
  }
  cancel() {
    this.epoch++; void this.release();
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'cancel' }));
    this.socket?.close(); this.socket = undefined;
    this.patch({ phase: 'idle', text: '', level: 0, message: '' });
  }
}
