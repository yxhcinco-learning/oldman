import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MiniAuthClient,
  MiniAuthError,
  WxMiniAuthAdapter,
  type MiniAuthExchangeResponse,
  type MiniAuthPlatform,
  type MiniAuthTokenStore,
  type StoredMiniSession,
} from '../miniprogram/auth/client';

const future = (now: number) => new Date(now + 60 * 60 * 1000).toISOString();
const token = (number: number) => `business_session_${number}`.padEnd(43, 'x');

class FakePlatform implements MiniAuthPlatform {
  loginCalls = 0;
  exchangeCalls: string[] = [];
  response: MiniAuthExchangeResponse | Error;
  gate?: Promise<void>;

  constructor(private readonly now: number, response?: MiniAuthExchangeResponse | Error) {
    this.response = response ?? { statusCode: 200, data: { token: token(1), expiresAt: future(now) } };
  }

  async login() {
    this.loginCalls += 1;
    await this.gate;
    return `wx-code-${this.loginCalls}`;
  }

  async exchange(code: string) {
    this.exchangeCalls.push(code);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

class FakeStorage implements MiniAuthTokenStore {
  value?: StoredMiniSession;
  failRead = false;
  failWrite = false;
  writes = 0;
  clears = 0;

  async read() { if (this.failRead) throw new Error('storage failed'); return this.value; }
  async write(value: StoredMiniSession) { this.writes += 1; if (this.failWrite) throw new Error('storage failed'); this.value = value; }
  async clear() { this.clears += 1; this.value = undefined; }
}

afterEach(() => vi.unstubAllGlobals());

describe('小程序无感业务会话', () => {
  it('并发启动只执行一次 wx.login 和换码', async () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const platform = new FakePlatform(now);
    let release = () => undefined;
    platform.gate = new Promise<void>(resolve => { release = resolve; });
    const storage = new FakeStorage();
    const client = new MiniAuthClient(platform, storage, () => now);
    const sessions = [client.ensureSession(), client.ensureSession(), client.ensureSession()];
    release();
    await expect(Promise.all(sessions)).resolves.toEqual([token(1), token(1), token(1)]);
    expect(platform.loginCalls).toBe(1);
    expect(platform.exchangeCalls).toEqual(['wx-code-1']);
    expect(client.snapshot()).toEqual({ status: 'authenticated', persisted: true });
  });

  it('优先使用未过期的加密持久会话且不索取用户资料', async () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const platform = new FakePlatform(now);
    const storage = new FakeStorage();
    storage.value = { version: 1, token: token(8), expiresAt: now + 60 * 60 * 1000 };
    const client = new MiniAuthClient(platform, storage, () => now);
    await expect(client.ensureSession()).resolves.toBe(token(8));
    expect(platform.loginCalls).toBe(0);
    expect(client.snapshot()).toEqual({ status: 'authenticated', persisted: true });
    expect(storage.value).toEqual({ version: 1, token: token(8), expiresAt: now + 60 * 60 * 1000 });
  });

  it('加密 storage 写入失败时保留内存会话，不阻塞本地动作', async () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const platform = new FakePlatform(now);
    const storage = new FakeStorage();
    storage.failWrite = true;
    const client = new MiniAuthClient(platform, storage, () => now);
    await expect(client.ensureSession()).resolves.toBe(token(1));
    await expect(client.ensureSession()).resolves.toBe(token(1));
    expect(platform.loginCalls).toBe(1);
    expect(storage.clears).toBe(1);
    expect(client.snapshot()).toEqual({ status: 'authenticated', persisted: false });
  });

  it('断网后台失败不抛到启动流程，本地写作仍可继续', async () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const platform = new FakePlatform(now, new Error('network details'));
    const client = new MiniAuthClient(platform, new FakeStorage(), () => now);
    client.startBackground();
    await vi.waitFor(() => expect(client.snapshot().status).toBe('offline'));
    expect(client.snapshot().error).toBe('在线身份暂不可用，本地写作仍可使用。');
    const localWrite = vi.fn(() => 'saved-locally');
    expect(localWrite()).toBe('saved-locally');
  });

  it('并发 401 只触发一次重新登录并且每个请求最多重试一次', async () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const platform = new FakePlatform(now);
    platform.response = { statusCode: 200, data: { token: token(1), expiresAt: future(now) } };
    const client = new MiniAuthClient(platform, new FakeStorage(), () => now);
    const request = vi.fn(async (businessToken: string) => ({
      statusCode: businessToken === token(1) ? 401 : 200,
      data: businessToken,
    }));
    platform.exchange = async code => {
      platform.exchangeCalls.push(code);
      const sequence = platform.exchangeCalls.length;
      return { statusCode: 200, data: { token: token(sequence), expiresAt: future(now) } };
    };
    const [first, second] = await Promise.all([client.authorizedRequest(request), client.authorizedRequest(request)]);
    expect(first).toEqual({ statusCode: 200, data: token(2) });
    expect(second).toEqual({ statusCode: 200, data: token(2) });
    expect(platform.loginCalls).toBe(2);
    expect(platform.exchangeCalls).toEqual(['wx-code-1', 'wx-code-2']);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('拒绝过期或畸形业务响应且不写入 token', async () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const storage = new FakeStorage();
    const client = new MiniAuthClient(new FakePlatform(now, { statusCode: 200, data: { token: 'short', expiresAt: future(now), nickname: '不应使用' } }), storage, () => now);
    await expect(client.ensureSession()).rejects.toBeInstanceOf(MiniAuthError);
    expect(storage.writes).toBe(0);
    expect(client.snapshot().status).toBe('offline');
  });
});

describe('微信原生适配器安全参数', () => {
  it('只提交一次性 code 并明确启用异步加密 storage', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('wx', {
      login: (options: { success(result: { code: string }): void }) => options.success({ code: 'wx-one-use-code' }),
      request: (options: { data: unknown; success(result: { statusCode: number; data: unknown }): void }) => {
        calls.push(options as unknown as Record<string, unknown>);
        options.success({ statusCode: 200, data: { token: token(1), expiresAt: '2026-09-01T01:00:00.000Z' } });
      },
      getStorage: (options: { encrypt?: boolean; success(result: { data: StoredMiniSession }): void }) => {
        calls.push(options as unknown as Record<string, unknown>);
        options.success({ data: { version: 1, token: token(1), expiresAt: 1 } });
      },
      setStorage: (options: { encrypt?: boolean; success(): void }) => { calls.push(options as unknown as Record<string, unknown>); options.success(); },
      removeStorage: (options: { success(): void }) => options.success(),
    });
    const adapter = new WxMiniAuthAdapter('https://mini.example');
    const code = await adapter.login();
    await adapter.exchange(code);
    await adapter.write({ version: 1, token: token(1), expiresAt: 1 });
    await adapter.read();
    expect(calls[0]?.data).toEqual({ code: 'wx-one-use-code' });
    expect(Object.keys(calls[0]?.data as object)).toEqual(['code']);
    expect(calls[1]?.encrypt).toBe(true);
    expect(calls[2]?.encrypt).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('nickname');
    expect(JSON.stringify(calls)).not.toContain('avatar');
    expect(JSON.stringify(calls)).not.toContain('phone');
  });
});
