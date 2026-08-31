export type MiniAuthStatus = 'idle' | 'connecting' | 'authenticated' | 'offline';

export interface MiniAuthSnapshot {
  status: MiniAuthStatus;
  persisted: boolean;
  error?: string;
}

export interface MiniAuthExchangeResponse {
  statusCode: number;
  data: unknown;
}

export interface MiniAuthPlatform {
  login(): Promise<string>;
  exchange(code: string): Promise<MiniAuthExchangeResponse>;
}

export interface MiniAuthTokenStore {
  read(): Promise<StoredMiniSession | undefined>;
  write(session: StoredMiniSession): Promise<void>;
  clear(): Promise<void>;
}

export interface StoredMiniSession {
  version: 1;
  token: string;
  expiresAt: number;
}

export interface AuthenticatedMiniResponse<T> {
  statusCode: number;
  data: T;
}

export class MiniAuthError extends Error {
  constructor(message = '在线身份暂不可用，本地写作仍可使用。') {
    super(message);
    this.name = 'MiniAuthError';
  }
}

const validToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43,256}$/.test(token);

export class MiniAuthClient {
  private session?: StoredMiniSession;
  private loadAttempted = false;
  private loginFlight?: Promise<string>;
  private snapshotValue: MiniAuthSnapshot = { status: 'idle', persisted: false };

  constructor(
    private readonly platform: MiniAuthPlatform,
    private readonly storage: MiniAuthTokenStore,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): MiniAuthSnapshot {
    return { ...this.snapshotValue };
  }

  startBackground() {
    void this.ensureSession().catch(() => undefined);
  }

  ensureSession(force = false): Promise<string> {
    if (!force && this.session && this.session.expiresAt > this.now() + 30_000) return Promise.resolve(this.session.token);
    if (this.loginFlight) return this.loginFlight;
    this.loginFlight = this.login(force).finally(() => { this.loginFlight = undefined; });
    return this.loginFlight;
  }

  private async login(force: boolean): Promise<string> {
    this.snapshotValue = { status: 'connecting', persisted: false };
    if (!force && !this.loadAttempted) {
      this.loadAttempted = true;
      try {
        const stored = await this.storage.read();
        if (stored?.version === 1 && validToken(stored.token) && Number.isFinite(stored.expiresAt) && stored.expiresAt > this.now() + 30_000) {
          this.session = stored;
          this.snapshotValue = { status: 'authenticated', persisted: true };
          return stored.token;
        }
      } catch {
        // Encrypted storage is optional; this runtime can continue with memory only.
      }
    }

    try {
      const code = await this.platform.login();
      if (!code || code.length > 512 || /[\s\u0000-\u001f\u007f]/.test(code)) throw new MiniAuthError();
      const response = await this.platform.exchange(code);
      if (response.statusCode !== 200 || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw new MiniAuthError();
      const payload = response.data as { token?: unknown; expiresAt?: unknown };
      const expiresAt = typeof payload.expiresAt === 'string' ? Date.parse(payload.expiresAt) : Number.NaN;
      if (!validToken(payload.token) || !Number.isFinite(expiresAt) || expiresAt <= this.now() + 30_000) throw new MiniAuthError();
      const session: StoredMiniSession = { version: 1, token: payload.token, expiresAt };
      this.session = session;
      let persisted = false;
      try {
        await this.storage.write(session);
        persisted = true;
      } catch {
        try { await this.storage.clear(); } catch { /* Memory session remains valid. */ }
      }
      this.snapshotValue = { status: 'authenticated', persisted };
      return session.token;
    } catch (error) {
      this.session = undefined;
      const authError = error instanceof MiniAuthError ? error : new MiniAuthError();
      this.snapshotValue = { status: 'offline', persisted: false, error: authError.message };
      throw authError;
    }
  }

  async clearSession() {
    this.session = undefined;
    try { await this.storage.clear(); } catch { /* Clearing must not block local features. */ }
  }

  async authorizedRequest<T>(request: (token: string) => Promise<AuthenticatedMiniResponse<T>>): Promise<AuthenticatedMiniResponse<T>> {
    const firstToken = await this.ensureSession();
    const first = await request(firstToken);
    if (first.statusCode !== 401) return first;
    await this.clearSession();
    const recoveredToken = await this.ensureSession(true);
    return request(recoveredToken);
  }
}

const STORAGE_KEY = 'suiyue.mini.business-session.v1';

export class WxMiniAuthAdapter implements MiniAuthPlatform, MiniAuthTokenStore {
  constructor(private readonly origin: string) {}

  login(): Promise<string> {
    return new Promise((resolve, reject) => wx.login({
      success: result => result.code ? resolve(result.code) : reject(new MiniAuthError()),
      fail: () => reject(new MiniAuthError()),
    }));
  }

  exchange(code: string): Promise<MiniAuthExchangeResponse> {
    return new Promise((resolve, reject) => wx.request({
      url: `${this.origin}/api/mini/auth/wechat`,
      method: 'POST',
      data: { code },
      timeout: 8000,
      success: result => resolve({ statusCode: result.statusCode, data: result.data }),
      fail: () => reject(new MiniAuthError()),
    }));
  }

  read(): Promise<StoredMiniSession | undefined> {
    return new Promise(resolve => wx.getStorage<StoredMiniSession>({
      key: STORAGE_KEY,
      encrypt: true,
      success: result => resolve(result.data),
      fail: () => resolve(undefined),
    }));
  }

  write(session: StoredMiniSession): Promise<void> {
    return new Promise((resolve, reject) => wx.setStorage<StoredMiniSession>({
      key: STORAGE_KEY,
      data: session,
      encrypt: true,
      success: () => resolve(),
      fail: () => reject(new MiniAuthError()),
    }));
  }

  clear(): Promise<void> {
    return new Promise((resolve, reject) => wx.removeStorage({
      key: STORAGE_KEY,
      success: () => resolve(),
      fail: () => reject(new MiniAuthError()),
    }));
  }
}
