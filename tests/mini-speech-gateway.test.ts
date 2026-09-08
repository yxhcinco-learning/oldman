// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import type { OperationEntry } from '../server/operations';
import { SpeechTicketStore } from '../server/speech-ticket-store';
import { WechatAuthService } from '../server/wechat-auth';

const credentials = { appId: '123456', secretId: 'test-id', secretKey: 'test-key' };

class Upstream extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  response(data: unknown) { this.emit('message', Buffer.from(JSON.stringify(data))); }
}

const resources: Array<{ app: Awaited<ReturnType<typeof createGateway>>; identity: MiniIdentityStore; sockets: WebSocket[] }> = [];

async function setup(options: { now?: () => number; ticketTtlMs?: number; account?: boolean } = {}) {
  const identity = new MiniIdentityStore({ path: ':memory:' });
  const service = new WechatAuthService({ appId: 'wx-test-domain' }, identity, {
    exchange: async () => ({ appId: 'wx-test-domain', openid: 'openid-private' }),
  });
  const tickets = new SpeechTicketStore({ now: options.now, ttlMs: options.ticketTtlMs });
  const upstreams: Upstream[] = [];
  const connect = vi.fn<() => WebSocket>(() => {
    const upstream = new Upstream();
    upstreams.push(upstream);
    return upstream as unknown as WebSocket;
  });
  const operations: OperationEntry[] = [];
  const app = await createGateway({ credentials, origin: 'https://web.example', miniAuth: { service }, speechTickets: tickets, connect, operations: entry => operations.push(entry) });
  const sockets: WebSocket[] = [];
  resources.push({ app, identity, sockets });
  const session = identity.issueSession('wx-test-domain', 'openid-private', options.account ? 'account' : 'legacy');
  const issue = async () => app.inject({ method: 'POST', url: '/api/mini/speech-ticket', headers: { authorization: `Bearer ${session.token}` } });
  const open = async (ticket: string) => {
    const received: Array<{ type: string; text?: string }> = [];
    const socket = await app.injectWS(`/api/mini/speech?ticket=${encodeURIComponent(ticket)}`, {}, {
      onInit(value) { value.on('message', data => received.push(JSON.parse(data.toString()))); },
    });
    sockets.push(socket);
    return { socket, received };
  };
  return { app, identity, session, tickets, connect, upstreams, operations, issue, open };
}

afterEach(async () => {
  if (vi.isFakeTimers()) { vi.clearAllTimers(); vi.useRealTimers(); }
  for (const resource of resources.splice(0)) {
    for (const socket of resource.sockets) socket.terminate();
    await resource.app.close();
    resource.identity.close();
  }
});

describe('小程序一次性 ticket 语音网关', () => {
  it('只向有效业务会话签发60秒 ticket，并用一次后接入既有腾讯协议', async () => {
    const value = await setup();
    expect((await value.app.inject({ method: 'POST', url: '/api/mini/speech-ticket' })).statusCode).toBe(401);
    const issued = await value.issue();
    expect(issued.statusCode).toBe(200);
    const payload = issued.json<{ ticket: string; expiresAt: string }>();
    expect(payload.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(payload.expiresAt)).toBeGreaterThan(Date.now());

    const { socket, received } = await value.open(payload.ticket);
    expect(value.connect).toHaveBeenCalledTimes(1);
    value.upstreams[0]!.response({ code: 0 });
    await vi.waitFor(() => expect(received[0]?.type).toBe('ready'));
    socket.send(Buffer.alloc(1280));
    await vi.waitFor(() => expect(value.upstreams[0]!.send).toHaveBeenCalledWith(expect.any(Buffer), { binary: true }));
    value.upstreams[0]!.response({ code: 0, result: { index: 0, slice_type: 2, voice_text_str: '口述文字。' } });
    socket.send('{"type":"end"}');
    value.upstreams[0]!.response({ code: 0, final: 1 });
    await vi.waitFor(() => expect(received.at(-1)?.type).toBe('done'));
    expect(received.some(event => event.text === '口述文字。')).toBe(true);

    await expect(value.open(payload.ticket)).rejects.toThrow();
    expect(value.connect).toHaveBeenCalledTimes(1);
    const visible = JSON.stringify({ issued: issued.json(), operations: value.operations });
    expect(visible).not.toContain(value.session.token);
    expect(visible).not.toContain('openid-private');
    expect(JSON.stringify(value.operations)).not.toContain(payload.ticket);
  });

  it('在腾讯连接前拒绝缺失、过期、重放及带额外查询参数的 ticket', async () => {
    let now = 1000;
    const value = await setup({ now: () => now, ticketTtlMs: 100 });
    const expired = (await value.issue()).json<{ ticket: string; expiresAt: string }>();
    now = Date.parse(expired.expiresAt);
    await expect(value.open(expired.ticket)).rejects.toThrow();
    await expect(value.app.injectWS('/api/mini/speech')).rejects.toThrow();
    await expect(value.app.injectWS(`/api/mini/speech?ticket=${encodeURIComponent('x'.repeat(43))}&other=1`)).rejects.toThrow();
    expect(value.connect).not.toHaveBeenCalled();
  });

  it('并发使用同一 ticket 时恰好一个握手能够消费它', async () => {
    const value = await setup();
    const { ticket } = (await value.issue()).json<{ ticket: string }>();
    const settled = await Promise.allSettled([value.open(ticket), value.open(ticket)]);
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(value.connect).toHaveBeenCalledTimes(1);
  });

  it('未配置腾讯凭据时不签发 ticket，也不创建上游连接', async () => {
    const identity = new MiniIdentityStore({ path: ':memory:' });
    const service = new WechatAuthService({ appId: 'wx-test-domain' }, identity, { exchange: async () => ({ appId: 'wx-test-domain', openid: 'openid-one' }) });
    const connect = vi.fn<() => WebSocket>();
    const app = await createGateway({ origin: 'https://web.example', miniAuth: { service }, connect });
    resources.push({ app, identity, sockets: [] });
    const session = identity.issueSession('wx-test-domain', 'openid-one');
    const response = await app.inject({ method: 'POST', url: '/api/mini/speech-ticket', headers: { authorization: `Bearer ${session.token}` } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: '语音服务尚未配置，请继续使用文字输入。' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('排空期间账号被接管会立即终止队列，已识别文字仍保留', async () => {
    const value = await setup({ account: true });
    const { ticket } = (await value.issue()).json<{ ticket: string }>();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { socket, received } = await value.open(ticket);
    const upstream = value.upstreams[0]!;
    upstream.response({ code: 0, result: { index: 0, slice_type: 2, voice_text_str: '保留这句。' } });
    for (let index = 0; index < 2; index++) socket.send(Buffer.alloc(64 * 1024));
    socket.send('{"type":"end"}');
    await new Promise(resolve => setImmediate(resolve));
    value.identity.issueSession('wx-test-domain', 'openid-private', 'account');
    await vi.advanceTimersByTimeAsync(1000);
    await new Promise(resolve => setImmediate(resolve));
    expect(upstream.readyState).toBe(3);
    expect(received.some(event => event.type === 'error')).toBe(true);
    expect(received.some(event => event.text === '保留这句。')).toBe(true);
    expect(upstream.send).not.toHaveBeenCalledWith('{"type":"end"}');
    const sent = upstream.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30001);
    expect(upstream.send).toHaveBeenCalledTimes(sent);
    expect(vi.getTimerCount()).toBe(0);
  });
});
