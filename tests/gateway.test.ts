// @vitest-environment node
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { createGateway, type GatewayOptions } from '../server/gateway';
import { loadAsrEngineModel, signedAsrUrl, parseTencentResult } from '../server/tencent';
import { TranscriptAccumulator } from '../packages/core/src/speech-protocol';

const credentials = { appId: '123456', secretId: 'test-id', secretKey: 'test-key' };
const origin = 'http://localhost:3001';
class Upstream extends EventEmitter {
  readyState = 1; bufferedAmount = 0;
  send = vi.fn();
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  response(data: unknown) { this.emit('message', Buffer.from(JSON.stringify(data))); }
}
const apps: Awaited<ReturnType<typeof createGateway>>[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => { for (const s of sockets.splice(0)) s.terminate(); for (const app of apps.splice(0)) await app.close(); });
async function setup(options: Partial<GatewayOptions> = {}) {
  const upstream = new Upstream();
  const connect = vi.fn<(url: string) => WebSocket>(() => upstream as unknown as WebSocket);
  const app = await createGateway({ credentials, origin, connect, ...options }); apps.push(app); await app.ready();
  const received: { type: string; text?: string; message?: string }[] = [];
  const open = async () => { const socket = await app.injectWS('/api/speech', { headers: { origin } }, { onInit(s) { s.on('message', b => received.push(JSON.parse(b.toString()))); } }); sockets.push(socket); return socket; };
  return { app, upstream, connect, received, open };
}
it('reports unavailable configuration without revealing credentials', async () => {
  const s = await setup({ credentials: undefined });
  const response = await s.app.inject('/api/speech/status'); expect(response.json()).toEqual({ configured: false, provider: '腾讯云', maxSeconds: 300 });
  await expect(s.open()).rejects.toThrow(); expect(s.connect).not.toHaveBeenCalled();
});
it('reports configured status without contacting Tencent or exposing the identity', async () => {
  const s = await setup();
  const response = await s.app.inject('/api/speech/status');
  expect(response.json()).toEqual({ configured: true, provider: '腾讯云', maxSeconds: 300 });
  expect(response.body).not.toContain(credentials.secretId); expect(response.body).not.toContain(credentials.secretKey);
  expect(s.connect).not.toHaveBeenCalled();
});
it('rejects foreign origins before connecting upstream', async () => {
  const s = await setup();
  expect((await s.app.inject({ url: '/api/speech/status', headers: { origin: 'https://other.example' } })).statusCode).toBe(403);
  await expect(s.app.injectWS('/api/speech', { headers: { origin: 'https://other.example' } })).rejects.toThrow(); expect(s.connect).not.toHaveBeenCalled();
});
it('relays PCM and normalized final text without duplicate sentences', async () => {
  const s = await setup(); const socket = await s.open(); s.upstream.response({ code: 0 });
  await vi.waitFor(() => expect(s.received[0]?.type).toBe('ready'));
  socket.send(Buffer.alloc(1280)); await vi.waitFor(() => expect(s.upstream.send).toHaveBeenCalled());
  s.upstream.response({ code: 0, result: { index: 0, slice_type: 1, voice_text_str: '十六岁' } });
  s.upstream.response({ code: 0, result: { index: 0, slice_type: 2, voice_text_str: '十六岁那年。' } });
  socket.send('{"type":"end"}'); await vi.waitFor(() => expect(s.upstream.send).toHaveBeenCalledWith('{"type":"end"}'));
  s.upstream.response({ code: 0, final: 1 }); await vi.waitFor(() => expect(s.received.at(-1)?.type).toBe('done'));
  expect(s.received.filter(r => r.type === 'transcript').at(-1)?.text).toBe('十六岁那年。');
});
it('bounds concurrent sessions and frees the slot after cancellation', async () => {
  const s = await setup({ maxConnections: 1 }); const first = await s.open(); await expect(s.open()).rejects.toThrow();
  first.send('{"type":"cancel"}'); await vi.waitFor(() => expect(s.upstream.readyState).toBe(3));
  const next = await s.open(); expect(next.readyState).toBe(1);
});
it('rejects excessive audio and sanitizes provider errors', async () => {
  const s = await setup({ maxBytes: 4 }); const socket = await s.open(); s.upstream.response({ code: 0 }); socket.send(Buffer.alloc(6));
  await vi.waitFor(() => expect(s.received.some(r => r.type === 'error')).toBe(true)); expect(s.upstream.readyState).toBe(3);
  const another = await setup(); await another.open(); another.upstream.response({ code: 401, message: 'sensitive provider details' });
  await vi.waitFor(() => expect(another.received[0]?.type).toBe('error')); expect(JSON.stringify(another.received)).not.toContain('sensitive');
});
it('ends at the configured duration without losing already emitted text', async () => {
  const s = await setup({ maxDurationMs: 60 }); await s.open(); s.upstream.response({ code: 0, result: { index: 0, slice_type: 2, voice_text_str: '保留文字。' } });
  await vi.waitFor(() => expect(s.received.some(r => r.type === 'limit')).toBe(true)); expect(s.upstream.send).toHaveBeenCalledWith('{"type":"end"}');
  expect(s.received.some(r => r.text === '保留文字。')).toBe(true);
});
it('loads only the supported Tencent engine models with a compatible default', () => {
  expect(loadAsrEngineModel({})).toBe('16k_zh');
  expect(loadAsrEngineModel({ TENCENT_ASR_ENGINE_MODEL_TYPE: ' 16k_zh_en ' })).toBe('16k_zh_en');
  expect(loadAsrEngineModel({ TENCENT_ASR_ENGINE_MODEL_TYPE: '16k_zh_en_2.0' })).toBe('16k_zh_en_2.0');
  expect(() => loadAsrEngineModel({ TENCENT_ASR_ENGINE_MODEL_TYPE: '16k_zh_en_3.0' })).toThrow(/16k_zh_en_2\.0/);
});
it('signs only the fixed endpoint and accepts current sentence lists', () => {
  const url = new URL(signedAsrUrl(credentials, { now: 1000, voiceId: 'voice-test', nonce: 9 }));
  const canonical = 'asr.cloud.tencent.com/asr/v2/123456?engine_model_type=16k_zh&expired=1600&nonce=9&secretid=test-id&timestamp=1000&voice_format=1&voice_id=voice-test';
  expect(url.searchParams.get('signature')).toBe(createHmac('sha1', 'test-key').update(canonical).digest('base64')); expect(url.protocol).toBe('wss:');
  expect(new URL(signedAsrUrl(credentials, { engineModel: '16k_zh_en_2.0' })).searchParams.get('engine_model_type')).toBe('16k_zh_en_2.0');
  expect(parseTencentResult({ code: 0, sentences: { sentence_list: [{ sentence_id: 0, sentence_type: 1, sentence: '测试。' }] } }, new TranscriptAccumulator()).text).toBe('测试。');
});
it('passes the configured bilingual engine only to the signed Tencent upstream', async () => {
  const s = await setup({ engineModel: '16k_zh_en' });
  await s.open();
  const upstreamUrl = new URL(s.connect.mock.calls[0]?.[0] as string);
  expect(upstreamUrl.searchParams.get('engine_model_type')).toBe('16k_zh_en');
  expect(upstreamUrl.origin).toBe('wss://asr.cloud.tencent.com');
});
