// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PENDING_PCM_BYTES, PcmDelivery } from '../server/pcm-delivery';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const frames: Array<{ at: number; data: Buffer }> = [];
  const send = vi.fn((data: Buffer) => { frames.push({ at: Date.now(), data }); });
  const end = vi.fn();
  const error = vi.fn();
  const delivery = new PcmDelivery({ send, end, error });
  return { delivery, frames, send, end, error };
}

describe('有界 PCM 实时发送', () => {
  it('将突发分片按 40ms 节奏重组，并在最后完整样本之后结束一次', () => {
    const value = setup();
    const first = Buffer.alloc(1500, 1), second = Buffer.alloc(1300, 2);
    expect(value.delivery.enqueue(first)).toBe(true);
    expect(value.delivery.enqueue(second)).toBe(true);
    value.delivery.finish();
    value.delivery.finish();
    expect(value.frames.map(frame => frame.data.length)).toEqual([1280]);
    vi.advanceTimersByTime(39);
    expect(value.frames).toHaveLength(1);
    vi.advanceTimersByTime(41);
    expect(value.frames.map(frame => [frame.at, frame.data.length])).toEqual([[0, 1280], [40, 1280], [80, 240]]);
    expect(Buffer.concat(value.frames.map(frame => frame.data))).toEqual(Buffer.concat([first, second]));
    expect(value.end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(8);
    expect(value.end).toHaveBeenCalledOnce();
    expect(value.error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('分片间暂时无积压时仍等待上一个分片的完整音频时长', () => {
    const value = setup();
    value.delivery.enqueue(Buffer.alloc(640));
    vi.advanceTimersByTime(5);
    value.delivery.enqueue(Buffer.alloc(320));
    value.delivery.finish();
    vi.advanceTimersByTime(14);
    expect(value.frames).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(value.frames.map(frame => frame.at)).toEqual([0, 20]);
    vi.advanceTimersByTime(10);
    expect(value.end).toHaveBeenCalledOnce();
  });

  it('定时器迟到后每次仅发送一帧，不追赶已经错过的节奏', () => {
    const value = setup();
    const callbacks: Array<() => void> = [];
    const schedule = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callbacks.push(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    value.delivery.enqueue(Buffer.alloc(12800));
    vi.setSystemTime(2000);
    callbacks.shift()!();
    expect(value.frames.map(frame => frame.at)).toEqual([0, 2000]);
    expect(callbacks).toHaveLength(1);
    expect(schedule.mock.calls.map(call => call[1])).toEqual([40, 40]);
    value.delivery.cancel();
    callbacks.shift()!();
    expect(value.frames).toHaveLength(2);
  });

  it('只接受有上限的积压，超限分片不会进入后续发送', () => {
    const value = setup();
    expect(value.delivery.enqueue(Buffer.alloc(MAX_PENDING_PCM_BYTES, 1))).toBe(true);
    expect(value.delivery.enqueue(Buffer.alloc(1280, 2))).toBe(true);
    expect(value.delivery.enqueue(Buffer.alloc(2, 3))).toBe(false);
    value.delivery.finish();
    vi.runAllTimers();
    const audio = Buffer.concat(value.frames.map(frame => frame.data));
    expect(audio.length).toBe(MAX_PENDING_PCM_BYTES + 1280);
    expect(audio.includes(3)).toBe(false);
    expect(value.end).toHaveBeenCalledOnce();
  });

  it('取消立即清队列和定时器，禁止后续发送与结束', () => {
    const value = setup();
    value.delivery.enqueue(Buffer.alloc(12800));
    value.delivery.finish();
    value.delivery.cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(value.send).toHaveBeenCalledOnce();
    expect(value.end).not.toHaveBeenCalled();
    expect(value.delivery.enqueue(Buffer.alloc(1280))).toBe(false);
  });

  it('发送异常立即释放资源并报告一次错误', () => {
    const value = setup();
    value.send.mockImplementation(() => { throw new Error('Network interrupted'); });
    value.delivery.enqueue(Buffer.alloc(12800));
    value.delivery.finish();
    vi.runAllTimers();
    expect(value.send).toHaveBeenCalledOnce();
    expect(value.error).toHaveBeenCalledOnce();
    expect(value.end).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('没有音频时结束一次，并拒绝结束后的音频', () => {
    const value = setup();
    value.delivery.finish();
    value.delivery.finish();
    expect(value.end).toHaveBeenCalledOnce();
    expect(value.delivery.enqueue(Buffer.alloc(1280))).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
