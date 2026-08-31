import type { AiRequest, AiResponse } from '../domain/core';
import type { MiniAiOperation, MiniAiTransport } from '../ai/controller';
import type { AuthenticatedMiniResponse, MiniAuthClient } from '../auth/client';
import { MINI_API_ORIGIN } from './config';

const MAX_RESPONSE_CHARS = 256 * 1024;

export interface MiniAiHttpOperation {
  response: Promise<AuthenticatedMiniResponse<unknown>>;
  cancel(): void;
}

export interface MiniAiHttpPlatform {
  post(url: string, request: AiRequest, token: string, timeoutMs: number): MiniAiHttpOperation;
}

function parseResponseData(value: unknown) {
  if (typeof value === 'string') {
    if (value.length > MAX_RESPONSE_CHARS) throw new Error('小文返回内容过长，原文未改变。');
    try { return JSON.parse(value) as unknown; }
    catch { throw new Error('小文返回的数据无法核对，原文未改变。'); }
  }
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch { throw new Error('小文返回的数据无法核对，原文未改变。'); }
  if (typeof serialized !== 'string') throw new Error('小文返回的数据无法核对，原文未改变。');
  if (serialized.length > MAX_RESPONSE_CHARS) throw new Error('小文返回内容过长，原文未改变。');
  return value;
}

export class WxMiniAiHttpPlatform implements MiniAiHttpPlatform {
  post(url: string, request: AiRequest, token: string, timeoutMs: number): MiniAiHttpOperation {
    let task: WechatMiniprogram.RequestTask | undefined;
    const response = new Promise<AuthenticatedMiniResponse<unknown>>((resolve, reject) => {
      task = wx.request({
        url,
        method: 'POST',
        data: request,
        dataType: '其他',
        responseType: 'text',
        timeout: timeoutMs,
        header: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        success: result => {
          try { resolve({ statusCode: result.statusCode, data: parseResponseData(result.data) }); }
          catch (error) { reject(error); }
        },
        fail: error => {
          if (/abort/i.test(error.errMsg)) reject(new Error('已取消小文请求，原文未改变。'));
          else if (/timeout/i.test(error.errMsg)) reject(new Error('小文请求超时，原文未改变，请重试。'));
          else reject(new Error('当前无法连接小文服务，本地写作仍可使用。'));
        },
      });
    });
    return { response, cancel: () => task?.abort() };
  }
}

function responseError(response: AuthenticatedMiniResponse<unknown>) {
  const payload = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data as { error?: unknown }
    : undefined;
  if (typeof payload?.error === 'string' && payload.error.length <= 300) return payload.error;
  if (response.statusCode === 401) return '在线身份已失效，请重试。';
  if (response.statusCode === 429) return '小文请求较多，请稍后再试。';
  if (response.statusCode === 503) return '小文在线服务尚未配置，本地写作仍可使用。';
  if (response.statusCode === 504) return '小文请求已取消或超时，原文未改变。';
  return '小文在线服务暂不可用，原文未改变。';
}

export class AuthenticatedMiniAiTransport implements MiniAiTransport {
  constructor(
    private readonly auth: MiniAuthClient,
    private readonly platform: MiniAiHttpPlatform = new WxMiniAiHttpPlatform(),
    private readonly origin = MINI_API_ORIGIN,
  ) {}

  request(request: AiRequest): MiniAiOperation {
    let cancelled = false;
    let cancelActive: () => void = () => {};
    const response = this.auth.authorizedRequest<unknown>(async token => {
      if (cancelled) throw new Error('已取消小文请求，原文未改变。');
      const operation = this.platform.post(`${this.origin}/api/mini/ai/turn`, request, token, 120_000);
      cancelActive = operation.cancel;
      try { return await operation.response; }
      finally { cancelActive = () => {}; }
    }).then(result => {
      if (cancelled) throw new Error('已取消小文请求，原文未改变。');
      if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(responseError(result));
      return result.data as AiResponse;
    });
    return {
      response,
      cancel() {
        cancelled = true;
        cancelActive();
      },
    };
  }
}
