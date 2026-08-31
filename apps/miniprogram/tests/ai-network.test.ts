import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniAuthClient, type MiniAuthPlatform, type MiniAuthTokenStore, type StoredMiniSession } from '../miniprogram/auth/client';
import { AuthenticatedMiniAiTransport, WxMiniAiHttpPlatform, type MiniAiHttpOperation, type MiniAiHttpPlatform } from '../miniprogram/network/ai';
import { buildAiRequest, emptyDraft, newSession, type AiRequest } from '../miniprogram/domain/core';

const now = Date.parse('2026-09-01T00:00:00.000Z');
const token = (number: number) => `mini_ai_token_${number}`.padEnd(43, 'x');
const request = () => buildAiRequest(newSession({ ...emptyDraft(), inputMode: 'text', textDraft: '原正文' }), 'regular', '', 'request-one');
const success = (value: AiRequest) => ({ requestId: value.requestId, result: { answer: '整理了标点。', body: '原正文。', citedVersionIds: [] } });

class AuthPlatform implements MiniAuthPlatform {
  calls = 0;
  async login() { this.calls += 1; return `wx-code-${this.calls}`; }
  async exchange() { return { statusCode: 200, data: { token: token(this.calls), expiresAt: new Date(now + 60 * 60 * 1000).toISOString() } }; }
}

class MemoryTokens implements MiniAuthTokenStore {
  value?: StoredMiniSession;
  async read() { return this.value; }
  async write(value: StoredMiniSession) { this.value = value; }
  async clear() { this.value = undefined; }
}

class HttpPlatform implements MiniAiHttpPlatform {
  calls: Array<{ url: string; request: AiRequest; token: string; timeoutMs: number }> = [];
  responses: Array<{ statusCode: number; data: unknown } | Error> = [];
  cancelled = 0;
  post(url: string, value: AiRequest, businessToken: string, timeoutMs: number): MiniAiHttpOperation {
    this.calls.push({ url, request: value, token: businessToken, timeoutMs });
    const next = this.responses.shift() ?? { statusCode: 200, data: success(value) };
    return {
      response: next instanceof Error ? Promise.reject(next) : Promise.resolve(next),
      cancel: () => { this.cancelled += 1; },
    };
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('小程序鉴权 AI 网络层', () => {
  it('携带业务 token，并在首个401后只单飞重登和重试一次', async () => {
    const authPlatform = new AuthPlatform();
    const auth = new MiniAuthClient(authPlatform, new MemoryTokens(), () => now);
    const http = new HttpPlatform();
    const value = request();
    http.responses.push({ statusCode: 401, data: { error: 'expired' } }, { statusCode: 200, data: success(value) });
    const operation = new AuthenticatedMiniAiTransport(auth, http, 'https://mini.example').request(value);
    await expect(operation.response).resolves.toEqual(success(value));
    expect(authPlatform.calls).toBe(2);
    expect(http.calls.map(call => call.token)).toEqual([token(1), token(2)]);
    expect(http.calls.map(call => call.url)).toEqual(['https://mini.example/api/mini/ai/turn', 'https://mini.example/api/mini/ai/turn']);
    expect(http.calls.every(call => call.timeoutMs === 120_000 && call.request === value)).toBe(true);
  });

  it('重试仍为401时停止，不循环登录或请求', async () => {
    const authPlatform = new AuthPlatform();
    const auth = new MiniAuthClient(authPlatform, new MemoryTokens(), () => now);
    const http = new HttpPlatform();
    http.responses.push({ statusCode: 401, data: {} }, { statusCode: 401, data: {} });
    await expect(new AuthenticatedMiniAiTransport(auth, http).request(request()).response).rejects.toThrow('在线身份已失效');
    expect(authPlatform.calls).toBe(2);
    expect(http.calls).toHaveLength(2);
  });

  it('保留服务端配置/限流错误，并且不对网络失败自动重试', async () => {
    const authPlatform = new AuthPlatform();
    const auth = new MiniAuthClient(authPlatform, new MemoryTokens(), () => now);
    const http = new HttpPlatform();
    http.responses.push({ statusCode: 503, data: { error: '请先配置本地 DeepSeek 服务并重启网关。' } });
    await expect(new AuthenticatedMiniAiTransport(auth, http).request(request()).response).rejects.toThrow('请先配置本地 DeepSeek');
    http.responses.push(new Error('当前无法连接小文服务，本地写作仍可使用。'));
    await expect(new AuthenticatedMiniAiTransport(auth, http).request(request()).response).rejects.toThrow('本地写作仍可使用');
    expect(http.calls).toHaveLength(2);
  });

  it('显式取消会终止当前 wx.request 等价操作', async () => {
    const auth = new MiniAuthClient(new AuthPlatform(), new MemoryTokens(), () => now);
    let rejectResponse: (error: Error) => void = () => {};
    const http: MiniAiHttpPlatform = {
      post: () => ({
        response: new Promise((_resolve, reject) => { rejectResponse = reject; }),
        cancel: () => rejectResponse(new Error('已取消小文请求，原文未改变。')),
      }),
    };
    const operation = new AuthenticatedMiniAiTransport(auth, http).request(request());
    await vi.waitFor(() => expect(auth.snapshot().status).toBe('authenticated'));
    operation.cancel();
    await expect(operation.response).rejects.toThrow('已取消');
  });
});

describe('wx.request AI 适配器', () => {
  it('使用 Bearer 请求、文本解析上限和可中止 RequestTask', async () => {
    const calls: Array<Record<string, unknown>> = [];
    let activeFail: ((error: { errMsg: string }) => void) | undefined;
    const abort = vi.fn(() => activeFail?.({ errMsg: 'request:fail abort' }));
    vi.stubGlobal('wx', {
      request: (options: { success(result: { statusCode: number; data: unknown }): void; fail(error: { errMsg: string }): void }) => {
        calls.push(options as unknown as Record<string, unknown>);
        activeFail = options.fail;
        return { abort };
      },
    });
    const platform = new WxMiniAiHttpPlatform();
    const value = request();
    const first = platform.post('https://mini.example/api/mini/ai/turn', value, token(1), 120_000);
    const firstOptions = calls[0] as { header: Record<string, string>; success(result: { statusCode: number; data: unknown }): void; dataType: string };
    firstOptions.success({ statusCode: 200, data: JSON.stringify(success(value)) });
    await expect(first.response).resolves.toEqual({ statusCode: 200, data: success(value) });
    expect(firstOptions.header).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token(1)}` });
    expect(firstOptions.dataType).toBe('其他');

    const oversized = platform.post('https://mini.example/api/mini/ai/turn', value, token(1), 120_000);
    const oversizedOptions = calls[1] as { success(result: { statusCode: number; data: unknown }): void };
    oversizedOptions.success({ statusCode: 200, data: 'x'.repeat(256 * 1024 + 1) });
    await expect(oversized.response).rejects.toThrow('内容过长');

    const empty = platform.post('https://mini.example/api/mini/ai/turn', value, token(1), 120_000);
    const emptyOptions = calls[2] as { success(result: { statusCode: number; data: unknown }): void };
    emptyOptions.success({ statusCode: 200, data: undefined });
    await expect(empty.response).rejects.toThrow('无法核对');

    const cancelled = platform.post('https://mini.example/api/mini/ai/turn', value, token(1), 120_000);
    cancelled.cancel();
    await expect(cancelled.response).rejects.toThrow('已取消');
    expect(abort).toHaveBeenCalledOnce();
  });
});
