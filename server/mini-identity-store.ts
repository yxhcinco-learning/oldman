import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_MINI_IDENTITY_DB_PATH = '/var/lib/suiyue-yousheng/auth.sqlite';

const SCHEMA_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MiniIdentityErrorCategory = 'invalid_session' | 'replayed_code' | 'integrity_failed';

export class MiniIdentityError extends Error {
  constructor(readonly category: MiniIdentityErrorCategory) {
    super(category);
    this.name = 'MiniIdentityError';
  }
}

export interface MiniIdentityStoreOptions {
  path: string;
  now?: () => number;
  sessionTtlMs?: number;
  maxActiveSessions?: number;
  revokedRetentionMs?: number;
  codeRetentionMs?: number;
  randomToken?: () => string;
}

export interface IssuedMiniSession {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface AuthenticatedMiniSession {
  userId: string;
  expiresAt: number;
}

interface IntegrityRow { quick_check: string }
interface IdentityRow { user_id: string }
interface SessionRow { id: string; user_id: string; expires_at: number; revoked_at: number | null; last_used_at: number | null }

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export class MiniIdentityStore {
  private readonly database: DatabaseSync;
  private readonly now: () => number;
  private readonly sessionTtlMs: number;
  private readonly maxActiveSessions: number;
  private readonly revokedRetentionMs: number;
  private readonly codeRetentionMs: number;
  private readonly randomToken: () => string;

  constructor(options: MiniIdentityStoreOptions) {
    if (!options.path) throw new Error('Identity database path is required');
    this.now = options.now ?? Date.now;
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * DAY_MS;
    this.maxActiveSessions = options.maxActiveSessions ?? 5;
    this.revokedRetentionMs = options.revokedRetentionMs ?? 7 * DAY_MS;
    this.codeRetentionMs = options.codeRetentionMs ?? DAY_MS;
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
    if (this.sessionTtlMs <= 0 || this.maxActiveSessions < 1 || this.codeRetentionMs <= 0) throw new Error('Invalid identity-store limits');

    this.database = new DatabaseSync(options.path, { allowExtension: false });
    try {
      this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA trusted_schema = OFF; PRAGMA synchronous = FULL;');
      if (options.path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
      this.migrate();
      this.assertIntegrity();
    } catch (error) {
      if (this.database.isOpen) this.database.close();
      throw error;
    }
  }

  private migrate() {
    const version = Number((this.database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);
    if (version > SCHEMA_VERSION) throw new Error('Identity database schema is newer than this release');
    if (version === SCHEMA_VERSION) return;

    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE wechat_identities (
          app_id TEXT NOT NULL,
          openid TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          PRIMARY KEY (app_id, openid)
        ) STRICT;
        CREATE INDEX wechat_identities_user_idx ON wechat_identities(user_id);
        CREATE TABLE mini_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          last_used_at INTEGER
        ) STRICT;
        CREATE INDEX mini_sessions_user_active_idx ON mini_sessions(user_id, revoked_at, expires_at, created_at);
        CREATE TABLE used_wechat_codes (
          code_hash TEXT PRIMARY KEY,
          used_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        ) STRICT;
        PRAGMA user_version = 1;
      `);
    });
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  assertIntegrity() {
    const result = (this.database.prepare('PRAGMA quick_check').get() as IntegrityRow | undefined)?.quick_check;
    if (result !== 'ok') throw new MiniIdentityError('integrity_failed');
  }

  consumeWechatCode(codeHash: string) {
    if (!/^[a-f0-9]{64}$/.test(codeHash)) throw new Error('Invalid code hash');
    const now = this.now();
    try {
      this.database.prepare('INSERT INTO used_wechat_codes (code_hash, used_at, expires_at) VALUES (?, ?, ?)')
        .run(codeHash, now, now + this.codeRetentionMs);
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) throw new MiniIdentityError('replayed_code');
      throw error;
    }
  }

  issueSession(appId: string, openid: string): IssuedMiniSession {
    if (!appId || !openid) throw new Error('Identity is required');
    const now = this.now();
    const expiresAt = now + this.sessionTtlMs;
    const token = this.randomToken();
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(token)) throw new Error('Session token generator returned an unsafe token');

    return this.transaction(() => {
      const identity = this.database.prepare('SELECT user_id FROM wechat_identities WHERE app_id = ? AND openid = ?').get(appId, openid) as IdentityRow | undefined;
      const userId = identity?.user_id ?? randomUUID();
      if (!identity) {
        this.database.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)').run(userId, now, now);
        this.database.prepare('INSERT INTO wechat_identities (app_id, openid, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
          .run(appId, openid, userId, now, now);
      } else {
        this.database.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(now, userId);
        this.database.prepare('UPDATE wechat_identities SET last_seen_at = ? WHERE app_id = ? AND openid = ?').run(now, appId, openid);
      }

      const active = this.database.prepare(`
        SELECT id FROM mini_sessions
        WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
        ORDER BY created_at ASC, id ASC
      `).all(userId, now) as Array<{ id: string }>;
      const revokeCount = Math.max(0, active.length - this.maxActiveSessions + 1);
      const revoke = this.database.prepare('UPDATE mini_sessions SET revoked_at = ? WHERE id = ?');
      for (const row of active.slice(0, revokeCount)) revoke.run(now, row.id);

      this.database.prepare('INSERT INTO mini_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), userId, sha256(token), now, expiresAt);
      return { token, userId, expiresAt };
    });
  }

  authenticate(token: string): AuthenticatedMiniSession {
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(token)) throw new MiniIdentityError('invalid_session');
    const now = this.now();
    const row = this.database.prepare(`
      SELECT id, user_id, expires_at, revoked_at, last_used_at
      FROM mini_sessions WHERE token_hash = ?
    `).get(sha256(token)) as SessionRow | undefined;
    if (!row || row.revoked_at !== null || row.expires_at <= now) throw new MiniIdentityError('invalid_session');
    if (row.last_used_at === null || row.last_used_at <= now - 5 * 60 * 1000) {
      this.database.prepare('UPDATE mini_sessions SET last_used_at = ? WHERE id = ?').run(now, row.id);
    }
    return { userId: row.user_id, expiresAt: row.expires_at };
  }

  revoke(token: string) {
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(token)) return;
    this.database.prepare('UPDATE mini_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(this.now(), sha256(token));
  }

  cleanup() {
    const now = this.now();
    return this.transaction(() => {
      const sessions = this.database.prepare(`
        DELETE FROM mini_sessions
        WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)
      `).run(now, now - this.revokedRetentionMs).changes;
      const codes = this.database.prepare('DELETE FROM used_wechat_codes WHERE expires_at <= ?').run(now).changes;
      return { sessions: Number(sessions), codes: Number(codes) };
    });
  }

  statistics() {
    const count = (table: 'users' | 'wechat_identities' | 'mini_sessions' | 'used_wechat_codes') =>
      Number((this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number } | undefined)?.count ?? 0);
    const journalMode = String((this.database.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode);
    const schemaVersion = Number((this.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    return {
      users: count('users'), identities: count('wechat_identities'), sessions: count('mini_sessions'),
      usedCodes: count('used_wechat_codes'), journalMode, schemaVersion,
    };
  }

  close() {
    if (this.database.isOpen) this.database.close();
  }
}
