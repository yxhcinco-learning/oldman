import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { TopicStore } from './topic-store';

const ADMIN_ID = 'primary-topic-editor';
const HASH_PREFIX = 'scrypt';
const SESSION_BYTES = 32;
const DEFAULT_SESSION_MS = 12 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 1024;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

interface ParsedPasswordHash {
  salt: Buffer;
  digest: Buffer;
}

interface AdminRow {
  id: string;
  username: string;
  password_hash: string;
  credential_fingerprint: string;
  active: number;
}

interface SessionRow {
  id: string;
  username: string;
  expires_at: string;
  csrf_hash: string;
  credential_fingerprint: string;
  current_fingerprint: string;
  active: number;
}

export interface TopicAdminConfiguration {
  username: string;
  passwordHash: string;
  secureCookie: boolean;
  sessionDurationMs: number;
}

export interface TopicAdminSession {
  id: string;
  username: string;
  token: string;
  csrfToken: string;
  expiresAt: string;
}

export interface AuthenticatedTopicAdmin {
  sessionId: string;
  username: string;
  expiresAt: string;
}

export class TopicAdminAuthError extends Error {
  constructor(readonly category: 'invalid_credentials' | 'unauthorized' | 'csrf_rejected' | 'not_configured', message: string) {
    super(message);
    this.name = 'TopicAdminAuthError';
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const credentialFingerprint = (username: string, passwordHash: string) => digest(`${username}\0${passwordHash}`);

function parsePasswordHash(value: string): ParsedPasswordHash | undefined {
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX || parts[1] !== String(SCRYPT_OPTIONS.N) ||
      parts[2] !== String(SCRYPT_OPTIONS.r) || parts[3] !== String(SCRYPT_OPTIONS.p)) return undefined;
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const passwordDigest = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || passwordDigest.length !== 64) return undefined;
    return { salt, digest: passwordDigest };
  } catch { return undefined; }
}

export function createTopicAdminPasswordHash(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`管理员密码长度必须为 ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符`);
  }
  const salt = randomBytes(16);
  const passwordDigest = scryptSync(password, salt, 64, SCRYPT_OPTIONS);
  return [HASH_PREFIX, SCRYPT_OPTIONS.N, SCRYPT_OPTIONS.r, SCRYPT_OPTIONS.p, salt.toString('base64url'), passwordDigest.toString('base64url')].join('$');
}

export function verifyTopicAdminPassword(password: string, encoded: string) {
  const parsed = parsePasswordHash(encoded);
  if (!parsed || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) return false;
  const actual = scryptSync(password, parsed.salt, parsed.digest.length, SCRYPT_OPTIONS);
  return timingSafeEqual(actual, parsed.digest);
}

export function loadTopicAdminConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { configuration?: TopicAdminConfiguration; problem?: string } {
  const username = env.TOPIC_ADMIN_USERNAME?.trim() ?? '';
  const passwordHash = env.TOPIC_ADMIN_PASSWORD_HASH?.trim() ?? '';
  if (!username && !passwordHash) return { problem: '话题管理员未配置，内部后台已关闭。' };
  if (!/^[A-Za-z0-9._@-]{3,64}$/.test(username) || !parsePasswordHash(passwordHash)) {
    return { problem: '话题管理员配置无效，内部后台已关闭。' };
  }
  const requestedDuration = Number(env.TOPIC_ADMIN_SESSION_HOURS ?? 12) * 60 * 60 * 1000;
  const sessionDurationMs = Number.isFinite(requestedDuration) && requestedDuration >= 15 * 60 * 1000 && requestedDuration <= 7 * 24 * 60 * 60 * 1000
    ? requestedDuration : DEFAULT_SESSION_MS;
  return { configuration: { username, passwordHash, secureCookie: env.NODE_ENV === 'production', sessionDurationMs } };
}

export class TopicAdminAuthService {
  constructor(
    private readonly store: TopicStore,
    readonly configuration: TopicAdminConfiguration,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.synchronizeAdministrator();
  }

  private synchronizeAdministrator() {
    const database = this.store.database;
    const fingerprint = credentialFingerprint(this.configuration.username, this.configuration.passwordHash);
    const current = database.prepare('SELECT id, username, password_hash, credential_fingerprint, active FROM topic_admin_users WHERE id = ?').get(ADMIN_ID) as AdminRow | undefined;
    const timestamp = this.now().toISOString();
    if (!current) {
      database.prepare(`INSERT INTO topic_admin_users
        (id, username, password_hash, credential_fingerprint, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(ADMIN_ID, this.configuration.username, this.configuration.passwordHash, fingerprint, timestamp, timestamp);
      return;
    }
    if (current.username !== this.configuration.username || current.password_hash !== this.configuration.passwordHash || !current.active) {
      database.exec('BEGIN IMMEDIATE');
      try {
        database.prepare('UPDATE topic_admin_users SET username = ?, password_hash = ?, credential_fingerprint = ?, active = 1, updated_at = ? WHERE id = ?')
          .run(this.configuration.username, this.configuration.passwordHash, fingerprint, timestamp, ADMIN_ID);
        database.prepare('UPDATE topic_admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL').run(timestamp, ADMIN_ID);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  }

  login(username: string, password: string): TopicAdminSession {
    const row = this.store.database.prepare('SELECT id, username, password_hash, credential_fingerprint, active FROM topic_admin_users WHERE id = ?').get(ADMIN_ID) as AdminRow | undefined;
    const passwordValid = row ? verifyTopicAdminPassword(password, row.password_hash) : false;
    const valid = Boolean(row?.active) && username === row?.username && passwordValid;
    if (!valid || !row) throw new TopicAdminAuthError('invalid_credentials', '用户名或密码不正确');
    const token = randomBytes(SESSION_BYTES).toString('base64url');
    const csrfToken = randomBytes(SESSION_BYTES).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.configuration.sessionDurationMs).toISOString();
    const id = randomBytes(18).toString('base64url');
    this.store.database.prepare(`INSERT INTO topic_admin_sessions
      (id, admin_id, token_hash, csrf_hash, credential_fingerprint, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
      .run(id, row.id, digest(token), digest(csrfToken), row.credential_fingerprint, createdAt.toISOString(), expiresAt);
    this.store.audit(row.username, 'admin.login', 'admin-session', id, {});
    return { id, username: row.username, token, csrfToken, expiresAt };
  }

  authenticate(token: string | undefined, csrfToken?: string): AuthenticatedTopicAdmin {
    if (!token || token.length < 32 || token.length > 128) throw new TopicAdminAuthError('unauthorized', '后台会话无效或已过期');
    const row = this.store.database.prepare(`
      SELECT s.id, u.username, s.expires_at, s.csrf_hash, s.credential_fingerprint,
        u.credential_fingerprint AS current_fingerprint, u.active
      FROM topic_admin_sessions s JOIN topic_admin_users u ON u.id = s.admin_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL
    `).get(digest(token)) as SessionRow | undefined;
    const now = this.now().toISOString();
    if (!row || !row.active || row.expires_at <= now || row.credential_fingerprint !== row.current_fingerprint) {
      throw new TopicAdminAuthError('unauthorized', '后台会话无效或已过期');
    }
    if (csrfToken !== undefined) {
      const provided = digest(csrfToken);
      if (!timingSafeEqual(Buffer.from(provided), Buffer.from(row.csrf_hash))) {
        throw new TopicAdminAuthError('csrf_rejected', '页面校验已失效，请刷新后重试');
      }
    }
    return { sessionId: row.id, username: row.username, expiresAt: row.expires_at };
  }

  logout(token: string | undefined, actor = this.configuration.username) {
    if (!token) return;
    const timestamp = this.now().toISOString();
    const row = this.store.database.prepare('SELECT id FROM topic_admin_sessions WHERE token_hash = ? AND revoked_at IS NULL').get(digest(token)) as { id: string } | undefined;
    if (!row) return;
    this.store.database.prepare('UPDATE topic_admin_sessions SET revoked_at = ? WHERE id = ?').run(timestamp, row.id);
    this.store.audit(actor, 'admin.logout', 'admin-session', row.id, {});
  }

  purgeExpired() {
    return this.store.database.prepare('DELETE FROM topic_admin_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL').run(this.now().toISOString()).changes;
  }
}
