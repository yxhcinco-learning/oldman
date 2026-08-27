import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeechSession, type SpeechDependencies } from '../features/speech/session';
import { HoldGesture } from '../features/speech/hold';
import { TranscriptAccumulator } from '../features/speech/protocol';

afterEach(() => vi.useRealTimers());
class Socket {
  readyState = 1; bufferedAmount = 0;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null; onclose: (() => void) | null = null;
  send = vi.fn(); close = vi.fn();
  event(data: unknown) { return this.onmessage?.({ data: JSON.stringify(data) }); }
}
function setup(overrides: Partial<SpeechDependencies> = {}) {
  const socket = new Socket(); const stopTrack = vi.fn(); const stopAudio = vi.fn().mockResolvedValue(undefined);
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const deps: SpeechDependencies = { status: vi.fn().mockResolvedValue(true), media: vi.fn().mockResolvedValue(stream), socket: () => socket as unknown as WebSocket,
    capture: vi.fn().mockResolvedValue({ stop: stopAudio }), ...overrides };
  const change = vi.fn(); const session = new SpeechSession(change, deps);
  return { socket, stream, stopTrack, stopAudio, deps, session, change };
}

describe('hold gesture', () => {
  it('requires 180ms and short release does not start', () => {
    vi.useFakeTimers(); const start = vi.fn(), stop = vi.fn(), short = vi.fn(); const hold = new HoldGesture(start, stop, vi.fn(), short);
    hold.press(); vi.advanceTimersByTime(179); hold.release(); expect(start).not.toHaveBeenCalled(); expect(short).toHaveBeenCalledOnce();
    hold.press(); vi.advanceTimersByTime(180); hold.release(); expect(start).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
  });
  it('cancels pointer holds and ignores repeated press', () => {
    vi.useFakeTimers(); const start = vi.fn(), abort = vi.fn(); const hold = new HoldGesture(start, vi.fn(), abort, vi.fn());
    hold.press(); hold.press(); hold.cancel(); vi.advanceTimersByTime(1000); expect(start).not.toHaveBeenCalled(); expect(abort).toHaveBeenCalledOnce();
  });
});
describe('speech session', () => {
  it('never falls back to mock when credentials are absent', async () => {
    const { session, deps } = setup({ status: vi.fn().mockResolvedValue(false) }); await session.start(); expect(session.state.phase).toBe('error'); expect(deps.media).not.toHaveBeenCalled(); expect(session.state.text).toBe('');
  });
  it('stops a late microphone permission grant after release', async () => {
    let grant!: (stream: MediaStream) => void;
    const s = setup({ media: vi.fn().mockImplementation(() => new Promise(resolve => { grant = resolve; })) });
    const job = s.session.start(); await vi.waitFor(() => expect(s.deps.media).toHaveBeenCalled()); await s.session.stop(); grant(s.stream); await job;
    expect(s.stopTrack).toHaveBeenCalled(); expect(s.deps.capture).not.toHaveBeenCalled(); expect(s.session.state.phase).toBe('idle');
  });
  it('handles permission rejection with a user-facing message', async () => {
    const { session } = setup({ media: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) }); await session.start(); expect(session.state.message).toContain('麦克风未获允许');
  });
  it('finishes audio before sending end and keeps final correction', async () => {
    const s = setup(); await s.session.start(); await s.socket.event({ type: 'ready' }); expect(s.session.state.phase).toBe('recording');
    s.socket.event({ type: 'transcript', text: '第一句', final: false }); await s.session.stop(); expect(s.stopTrack).toHaveBeenCalled(); expect(s.stopAudio).toHaveBeenCalled(); expect(s.socket.send).toHaveBeenCalledWith('{"type":"end"}');
    s.socket.event({ type: 'transcript', text: '第一句话。', final: true }); s.socket.event({ type: 'done' }); expect(s.session.state.text).toBe('第一句话。'); expect(s.session.state.phase).toBe('idle');
  });
  it('ignores late results after cancellation', async () => {
    const s = setup(); await s.session.start(); await s.socket.event({ type: 'ready' }); s.session.cancel(); s.socket.event({ type: 'transcript', text: '迟到文字', final: true }); expect(s.session.state.text).toBe(''); expect(s.stopTrack).toHaveBeenCalled();
  });
  it('retains partial text on disconnect', async () => {
    const s = setup(); await s.session.start(); await s.socket.event({ type: 'ready' }); s.socket.event({ type: 'transcript', text: '已收到的文字', final: false }); s.socket.onclose?.(); expect(s.session.state.phase).toBe('error'); expect(s.session.state.text).toBe('已收到的文字'); expect(s.stopTrack).toHaveBeenCalled();
  });
  it('releases audio created after cancellation', async () => {
    let finishCapture!: (audio: { stop: () => Promise<void> }) => void;
    const s = setup({ capture: vi.fn().mockImplementation(() => new Promise(resolve => { finishCapture = resolve; })) });
    await s.session.start(); const ready = s.socket.event({ type: 'ready' }); s.session.cancel(); finishCapture({ stop: s.stopAudio }); await ready;
    expect(s.stopAudio).toHaveBeenCalled(); expect(s.session.state.phase).toBe('idle');
  });
});
it('revises one sentence without duplicates and does not downgrade final text', () => {
  const acc = new TranscriptAccumulator(); acc.accept(0, '我十六岁', false); acc.accept(0, '我十六岁那年。', true); acc.accept(1, '坐火车。', true); acc.accept(0, '过期临时结果', false);
  expect(acc.text).toBe('我十六岁那年。坐火车。');
});
