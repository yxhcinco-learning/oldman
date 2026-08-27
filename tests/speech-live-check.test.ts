// @vitest-environment node
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { recognizePcm, runSpeechCheck, validatePcm } from '../scripts/speech-live-check.mjs';

it('checks local configuration without credentials, consent or audio upload', async () => {
  const connect = vi.fn();
  const readAudio = vi.fn();
  const result = await runSpeechCheck({ args: [], env: {}, readAudio, connect, fetchStatus: async () => ({ configured: true }) });
  expect(result).toEqual({ mode: 'preflight', configured: true, audioSent: false, recognitionVerified: false });
  expect(connect).not.toHaveBeenCalled(); expect(readAudio).not.toHaveBeenCalled();
});

it('refuses an audio upload without the explicit local flag before reading or connecting', async () => {
  const readAudio = vi.fn(); const connect = vi.fn(); const fetchStatus = vi.fn();
  await expect(runSpeechCheck({ args: ['--pcm', 'fixture.pcm'], env: {}, readAudio, connect, fetchStatus })).rejects.toThrow('未开启');
  expect(readAudio).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(fetchStatus).not.toHaveBeenCalled();
});

it.each([Buffer.alloc(0), Buffer.alloc(3), Buffer.alloc(960002)])('bounds PCM size before creating a provider connection', audio => {
  expect(() => validatePcm(audio)).toThrow();
});

it('does not connect when the gateway is unconfigured or the audio cannot be read', async () => {
  const connect = vi.fn();
  await expect(runSpeechCheck({ args: [], env: {}, connect, fetchStatus: async () => ({ configured: false }) })).rejects.toThrow('尚未配置');
  await expect(runSpeechCheck({ args: ['--pcm', 'missing.pcm'], env: { ALLOW_PAID_SPEECH_TEST: '1' }, connect, readAudio: async () => { throw new Error('private path'); } })).rejects.toThrow('读取失败');
  expect(connect).not.toHaveBeenCalled();
});

class TestSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn((data: unknown) => {
    if (typeof data === 'string') {
      this.emit('message', JSON.stringify({ type: 'transcript', text: '测试，语音。', final: true }));
      this.emit('message', JSON.stringify({ type: 'done' }));
    }
  });
  close = vi.fn(() => { this.readyState = 3; this.emit('close'); });
  terminate = this.close;
}

it('sends real-time frames only after ready and reports metrics without plaintext', async () => {
  vi.useFakeTimers();
  try {
    const socket = new TestSocket();
    const result = recognizePcm(Buffer.alloc(2560), () => socket, '测试语音');
    expect(socket.send).not.toHaveBeenCalled();
    socket.emit('message', '{"type":"ready"}');
    expect(socket.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(39); expect(socket.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(41);
    const report = await result;
    expect(report).toMatchObject({ mode: 'live', passed: true, audioSeconds: 0.08, finalSeen: true, expectedMatched: true });
    expect(JSON.stringify(report)).not.toContain('测试');
    expect(socket.close).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it('sanitizes gateway errors and cancels remaining sends', async () => {
  const socket = new TestSocket();
  const result = recognizePcm(Buffer.alloc(1280), () => socket);
  socket.emit('message', '{"type":"error","message":"private provider message"}');
  await expect(result).rejects.toThrow('网关拒绝');
  expect(socket.send).not.toHaveBeenCalled(); expect(socket.close).toHaveBeenCalledOnce();
});
