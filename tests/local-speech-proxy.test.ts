// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import WebSocket from 'ws';
import { createGateway } from '../server/gateway';

class LocalUpstream extends EventEmitter {
  readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  send = vi.fn((data: unknown) => {
    if (typeof data === 'string') this.emit('message', Buffer.from('{"code":0,"final":1}'));
    else this.emit('message', Buffer.from(JSON.stringify({ code: 0, result: { index: 0, slice_type: 2, voice_text_str: '测试。' } })));
  });
  close() { this.emit('close'); }
  terminate() { this.close(); }
}

it('keeps same-origin ASR upgrades out of Worker handlers and preserves Origin validation', async () => {
  const upstream = new LocalUpstream();
  const connect = vi.fn(() => {
    setImmediate(() => upstream.emit('message', Buffer.from('{"code":0}')));
    return upstream as unknown as WebSocket;
  });
  const gateway = await createGateway({ credentials: { appId: '123456', secretId: 'test-id', secretKey: 'test-key' }, origin: 'http://localhost:3001', connect });
  const gatewayUrl = await gateway.listen({ host: '127.0.0.1', port: 0 });
  const root = fileURLToPath(new URL('../', import.meta.url));
  const vite = await createServer({
    root, configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    cacheDir: 'node_modules/.vite-speech-proxy-test', logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, watch: null, proxy: { '/api/speech': { target: gatewayUrl, ws: true, changeOrigin: true } } },
  });
  const clients: WebSocket[] = [];
  try {
    await vite.listen();
    expect(vite.config.plugins.some(plugin => plugin.name.startsWith('cloudflare:'))).toBe(false);
    const port = (vite.httpServer!.address() as AddressInfo).port;
    const url = `ws://127.0.0.1:${port}/api/speech`;
    const types: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, { origin: 'http://localhost:3001' }); clients.push(socket);
      socket.on('error', reject);
      socket.on('close', () => { if (!types.includes('done')) reject(new Error('Proxy closed before done')); });
      socket.on('message', raw => {
        const event = JSON.parse(raw.toString()); types.push(event.type);
        if (event.type === 'ready') socket.send(Buffer.alloc(1280));
        if (event.type === 'transcript') socket.send('{"type":"end"}');
        if (event.type === 'done') { socket.close(); resolve(); }
      });
    });
    expect(types).toEqual(['ready', 'transcript', 'done']);
    const denied = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(url, { origin: 'https://foreign.example' }); clients.push(socket);
      socket.on('error', () => { /* Expected after terminating a rejected upgrade. */ });
      socket.on('open', () => reject(new Error('Foreign origin was accepted')));
      socket.on('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode!); socket.terminate(); });
    });
    expect(denied).toBe(403); expect(connect).toHaveBeenCalledOnce();
  } finally {
    for (const socket of clients) socket.terminate();
    await vite.close(); await gateway.close();
  }
}, 30000);
