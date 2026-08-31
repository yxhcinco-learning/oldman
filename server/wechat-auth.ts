import { sha256, MiniIdentityError, MiniIdentityStore, type IssuedMiniSession } from './mini-identity-store';

export interface WechatMiniConfiguration {
  appId: string;
  appSecret: string;
}

export type WechatExchangeErrorCategory = 'invalid_code' | 'upstream_unavailable' | 'invalid_response' | 'app_mismatch';

export class WechatExchangeError extends Error {
  constructor(readonly category: WechatExchangeErrorCategory) {
    super(category);
    this.name = 'WechatExchangeError';
  }
}

export interface WechatIdentity {
  appId: string;
  openid: string;
}

export interface WechatCodeTransport {
  exchange(code: string): Promise<WechatIdentity>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validCode = (code: string) => code.length >= 1 && code.length <= 512 && !/[\s\u0000-\u001f\u007f]/.test(code);

async function readBoundedBody(response: Response, maxBytes: number) {
  const announcedLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(announcedLength) && announcedLength > maxBytes) throw new WechatExchangeError('invalid_response');
  if (!response.body) throw new WechatExchangeError('invalid_response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new WechatExchangeError('invalid_response');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof WechatExchangeError) throw error;
    throw new WechatExchangeError('invalid_response');
  }
}

export class WechatCode2SessionTransport implements WechatCodeTransport {
  constructor(
    private readonly configuration: WechatMiniConfiguration,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
  ) {
    if (!/^wx[A-Za-z0-9]{8,30}$/.test(configuration.appId) || !configuration.appSecret || configuration.appSecret.length > 256) {
      throw new Error('Invalid WeChat mini-program configuration');
    }
  }

  async exchange(code: string): Promise<WechatIdentity> {
    if (!validCode(code)) throw new WechatExchangeError('invalid_code');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', this.configuration.appId);
    url.searchParams.set('secret', this.configuration.appSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, { method: 'GET', signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new WechatExchangeError('upstream_unavailable');
      const text = await readBoundedBody(response, 16 * 1024);
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw new WechatExchangeError('invalid_response'); }
      if (!isRecord(payload)) throw new WechatExchangeError('invalid_response');
      if ('errcode' in payload) {
        if (typeof payload.errcode !== 'number') throw new WechatExchangeError('invalid_response');
        if (payload.errcode !== 0) throw new WechatExchangeError(payload.errcode === 40029 || payload.errcode === 40163 ? 'invalid_code' : 'upstream_unavailable');
      }
      if (typeof payload.openid !== 'string' || payload.openid.length < 1 || payload.openid.length > 128 ||
          typeof payload.session_key !== 'string' || payload.session_key.length < 1 || payload.session_key.length > 256) {
        throw new WechatExchangeError('invalid_response');
      }
      return { appId: this.configuration.appId, openid: payload.openid };
    } catch (error) {
      if (error instanceof WechatExchangeError) throw error;
      throw new WechatExchangeError('upstream_unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
}

export class WechatAuthService {
  constructor(
    private readonly configuration: Pick<WechatMiniConfiguration, 'appId'>,
    private readonly store: MiniIdentityStore,
    private readonly transport: WechatCodeTransport,
  ) {}

  async login(code: string): Promise<IssuedMiniSession> {
    if (!validCode(code)) throw new WechatExchangeError('invalid_code');
    this.store.cleanup();
    this.store.consumeWechatCode(sha256(code));
    const identity = await this.transport.exchange(code);
    if (identity.appId !== this.configuration.appId) throw new WechatExchangeError('app_mismatch');
    if (typeof identity.openid !== 'string' || identity.openid.length < 1 || identity.openid.length > 128 || /[\u0000-\u001f\u007f]/.test(identity.openid)) {
      throw new WechatExchangeError('invalid_response');
    }
    return this.store.issueSession(identity.appId, identity.openid);
  }

  authenticateBearer(authorization: string | undefined) {
    const match = /^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(authorization ?? '');
    if (!match) throw new MiniIdentityError('invalid_session');
    return this.store.authenticate(match[1]!);
  }
}
