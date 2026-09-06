import type { DatabaseSync } from 'node:sqlite';

/** Called inside the identity migration transaction. */
export function migrateAccounts(database: DatabaseSync) {
  database.exec(`
    ALTER TABLE mini_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE mini_sessions ADD COLUMN revoked_reason TEXT;
    CREATE TABLE mini_accounts (
      user_id TEXT PRIMARY KEY REFERENCES users(id), nickname TEXT NOT NULL DEFAULT '',
      avatar BLOB, avatar_version INTEGER NOT NULL DEFAULT 0, sequence INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE cloud_works (
      user_id TEXT NOT NULL REFERENCES mini_accounts(user_id), id TEXT NOT NULL,
      version INTEGER NOT NULL, sequence INTEGER NOT NULL, title TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, purged INTEGER NOT NULL DEFAULT 0,
      snapshot TEXT, bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, id)
    ) STRICT;
    CREATE INDEX cloud_works_sequence ON cloud_works(user_id, sequence);
    CREATE TABLE cloud_operations (
      user_id TEXT NOT NULL REFERENCES mini_accounts(user_id), id TEXT NOT NULL,
      work_id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, id)
    ) STRICT;
    CREATE INDEX cloud_operations_work ON cloud_operations(user_id, work_id);
    PRAGMA user_version = 2;
  `);
}
