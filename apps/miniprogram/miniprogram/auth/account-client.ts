import { accountLoginSchema, accountProfileSchema, type AccountProfile } from '../domain/core';
import type { AuthenticatedMiniResponse } from './client';
import { errorMessage } from '../ui/error-message';

export type AccountStatus = 'guest' | 'connecting' | 'authenticated' | 'offline' | 'expired' | 'replaced';
export interface AccountState { status: AccountStatus; account: AccountProfile | null; error: string; generation: number }
export interface StoredAccountSession { version: 2; token: string; account: AccountProfile }
export interface AccountPlatform {
  login(): Promise<string>;
  request(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', token?: string, data?: unknown, binary?: boolean): Promise<AuthenticatedMiniResponse<unknown>>;
}
export interface AccountSessionStorage { read(): Promise<StoredAccountSession | undefined>; write(value: StoredAccountSession): Promise<void>; clear(): Promise<void> }
export interface MiniSessionAuthorizer {
  authorizedRequest<T>(request: (token: string) => Promise<AuthenticatedMiniResponse<T>>): Promise<AuthenticatedMiniResponse<T>>;
}
export class AccountRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) { super(message); this.name = 'AccountRequestError'; }
}
const payloadError = (response: AuthenticatedMiniResponse<unknown>) => {
  const payload = response.data as { code?: unknown; error?: unknown } | null;
  return new AccountRequestError(typeof payload?.code === 'string' ? payload.code : 'request_failed',
    errorMessage(payload?.error, '暂时无法连接云端，请稍后重试。'), response.statusCode);
};

export class MiniAccountClient implements MiniSessionAuthorizer {
  private session?: StoredAccountSession;
  private state: AccountState = { status: 'guest', account: null, error: '', generation: 0 };
  private listeners = new Set<(state: AccountState) => void>();
  private loginFlight?: Promise<void>;
  private refreshFlight?: Promise<void>;
  private restored = false;
  private restoreFlight?: Promise<void>;
  private storageTail: Promise<void> = Promise.resolve();
  constructor(readonly platform: AccountPlatform, private readonly storage: AccountSessionStorage, private readonly now = Date.now) {}
  snapshot(): AccountState { return { ...this.state, account: this.state.account ? { ...this.state.account } : null }; }
  subscribe(listener: (state: AccountState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(value: Partial<AccountState>) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener(this.snapshot())); }
  private persist(value: StoredAccountSession | undefined, generation: number) {
    const task = this.storageTail.catch(() => undefined).then(async () => {
      if (generation !== this.state.generation) return;
      if (value) await this.storage.write(value); else await this.storage.clear();
    });
    this.storageTail = task;
    return task;
  }

  restore(): Promise<void> {
    if (this.restoreFlight) return this.restoreFlight;
    this.restoreFlight = this.restoreStored().finally(() => { this.restoreFlight = undefined; });
    return this.restoreFlight;
  }

  private async restoreStored() {
    if (this.restored) return;
    this.restored = true;
    const generation = this.state.generation;
    let stored: StoredAccountSession | undefined;
    try { await this.storageTail.catch(() => undefined); stored = await this.storage.read(); } catch { return; }
    if (this.state.generation !== generation || !stored || stored.version !== 2) return;
    const parsed = accountLoginSchema.safeParse({ token: stored.token, account: stored.account }, { jitless: true });
    if (!parsed.success) return;
    this.session = stored;
    this.publish({ account: stored.account, generation: generation + 1, status: 'offline' });
    await this.refresh().catch(() => undefined);
  }

  login(): Promise<void> {
    if (this.loginFlight) return this.loginFlight;
    const generation = this.state.generation + 1;
    this.session = undefined;
    this.publish({ status: 'connecting', account: null, generation, error: '' });
    this.loginFlight = (async () => {
      try {
        await this.persist(undefined, generation);
        const code = await this.platform.login();
        if (this.state.generation !== generation) return;
        const response = await this.platform.request('/api/mini/account/login', 'POST', undefined, { code });
        if (response.statusCode !== 200) throw payloadError(response);
        const parsed = accountLoginSchema.parse(response.data, { jitless: true });
        if (this.state.generation !== generation) return;
        this.session = { version: 2, ...parsed };
        let error = '';
        try { await this.persist(this.session, generation); }
        catch { error = '登录记录未能保存，下次打开需要重新登录。'; }
        if (this.state.generation !== generation) return;
        this.publish({ status: 'authenticated', account: parsed.account, error });
      } catch (error) {
        if (this.state.generation === generation) this.publish({ status: 'guest', error: error instanceof AccountRequestError ? error.message : '微信登录未成功，请重试。' });
        throw error;
      }
    })().finally(() => { this.loginFlight = undefined; });
    return this.loginFlight;
  }

  async logout() {
    const session = this.session;
    this.session = undefined;
    this.publish({ status: 'guest', account: null, error: '', generation: this.state.generation + 1 });
    try { await this.persist(undefined, this.state.generation); }
    catch { this.publish({ error: '当前已退出，但登录记录清理失败，请重试退出。' }); }
    if (session) await this.platform.request('/api/mini/account/session', 'DELETE', session.token).catch(() => undefined);
  }

  setOffline() { if (this.session && !['expired', 'replaced'].includes(this.state.status)) this.publish({ status: 'offline', error: '网络不可用，云作品暂停编辑。' }); }

  private rejectSession(response: AuthenticatedMiniResponse<unknown>) {
    const error = payloadError(response);
    if (response.statusCode === 401) {
      this.publish({ status: error.code === 'session_replaced' ? 'replaced' : 'expired', error: error.code === 'session_replaced'
        ? '已在其他设备登录，请点击微信登录以在此设备继续。' : '登录已失效，请点击微信登录。' });
    }
    return error;
  }

  async authorizedRequest<T>(request: (token: string) => Promise<AuthenticatedMiniResponse<T>>): Promise<AuthenticatedMiniResponse<T>> {
    const session = this.session;
    if (!session || ['guest', 'connecting', 'expired', 'replaced'].includes(this.state.status)) throw new AccountRequestError('login_required', '请先点击微信登录。', 401);
    const generation = this.state.generation;
    let response: AuthenticatedMiniResponse<T>;
    try { response = await request(session.token); }
    catch (error) { if (generation === this.state.generation) this.setOffline(); throw error; }
    if (response.statusCode === 401 && generation === this.state.generation) this.rejectSession(response);
    return response;
  }

  bound(generation: number, accountId: string | null): MiniSessionAuthorizer {
    return { authorizedRequest: <T>(request: (token: string) => Promise<AuthenticatedMiniResponse<T>>) => {
      if (generation !== this.state.generation || accountId !== this.state.account?.id) return Promise.reject(new AccountRequestError('account_changed', '账号已变化，请重新打开作品。', 401));
      return this.authorizedRequest(request);
    } };
  }

  async request(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: unknown, binary = false) {
    const response = await this.authorizedRequest(token => this.platform.request(path, method, token, data, binary));
    if (response.statusCode < 200 || response.statusCode >= 300) throw payloadError(response);
    return response.data;
  }

  refresh(): Promise<void> {
    if (!this.session || ['guest', 'connecting', 'expired', 'replaced'].includes(this.state.status)) return Promise.resolve();
    if (this.refreshFlight) return this.refreshFlight;
    const generation = this.state.generation;
    const renew = Date.parse(this.session.account.expiresAt) > this.now() && Date.parse(this.session.account.expiresAt) - this.now() < 7 * 86400_000;
    this.refreshFlight = (async () => {
      const response = await this.request(renew ? '/api/mini/account/session/renew' : '/api/mini/account/me', renew ? 'POST' : 'GET');
      const account = accountProfileSchema.parse(response, { jitless: true });
      if (generation !== this.state.generation || !this.session) return;
      if (account.id !== this.session.account.id) throw new AccountRequestError('identity_mismatch', '账号核对失败，请重新登录。', 401);
      this.session = { ...this.session, account };
      await this.persist(this.session, generation).catch(() => undefined);
      if (generation !== this.state.generation) return;
      this.publish({ status: 'authenticated', account, error: '' });
    })().finally(() => { this.refreshFlight = undefined; });
    return this.refreshFlight;
  }

  async updateNickname(nickname: string) { await this.request('/api/mini/account/me', 'PUT', { nickname }); await this.refresh(); }
  async updateAvatar(data: ArrayBuffer) { await this.request('/api/mini/account/avatar', 'PUT', data); await this.refresh(); }
}

const STORAGE_KEY = 'suiyue.mini.account-session.v2';
export class WxAccountAdapter implements AccountPlatform, AccountSessionStorage {
  constructor(private readonly origin: string) {}
  login(): Promise<string> { return new Promise((resolve, reject) => wx.login({ success: result => result.code ? resolve(result.code) : reject(new Error('login')), fail: reject })); }
  request(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', token?: string, data?: unknown, binary = false): Promise<AuthenticatedMiniResponse<unknown>> {
    return new Promise((resolve, reject) => wx.request({ url: this.origin + path, method, data: data as WechatMiniprogram.RequestOption['data'], timeout: 15000,
      header: { 'Content-Type': data instanceof ArrayBuffer ? 'application/octet-stream' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      responseType: binary ? 'arraybuffer' : 'text', success: response => resolve({ statusCode: response.statusCode, data: response.data }),
      fail: () => reject(new AccountRequestError('network_unavailable', '网络不可用，请稍后重试。')) }));
  }
  read(): Promise<StoredAccountSession | undefined> { return new Promise(resolve => wx.getStorage<StoredAccountSession>({ key: STORAGE_KEY, encrypt: true, success: result => resolve(result.data), fail: () => resolve(undefined) })); }
  write(data: StoredAccountSession): Promise<void> { return new Promise((resolve, reject) => wx.setStorage({ key: STORAGE_KEY, encrypt: true, data, success: () => resolve(), fail: reject })); }
  clear(): Promise<void> { return new Promise((resolve, reject) => wx.removeStorage({ key: STORAGE_KEY, success: () => resolve(), fail: reject })); }
}
