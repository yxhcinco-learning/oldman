import type { DatabaseSync } from 'node:sqlite';
import { migrateUsernames } from './username-store';

export function migratePublications(database: DatabaseSync) {
  migrateUsernames(database);
  database.exec(`
    CREATE TABLE publication_articles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mini_accounts(user_id), work_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0, settings_version INTEGER NOT NULL DEFAULT 0, asset_id TEXT,
      pending_id TEXT, published_id TEXT, first_published_at TEXT, reason TEXT NOT NULL DEFAULT '',
      UNIQUE(user_id,work_id)
    ) STRICT;
    CREATE TABLE publication_assets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mini_accounts(user_id), work_id TEXT NOT NULL,
      digest TEXT NOT NULL, master BLOB NOT NULL, thumbnail BLOB NOT NULL, reading BLOB NOT NULL,
      width INTEGER NOT NULL, height INTEGER NOT NULL, crops TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX publication_assets_owner ON publication_assets(user_id,work_id);
    CREATE TABLE publication_submissions (
      id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES publication_articles(id), asset_id TEXT NOT NULL,
      content TEXT NOT NULL, bytes INTEGER NOT NULL, work_version INTEGER NOT NULL, settings_version INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected','withdrawn')),
      reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, reviewed_at TEXT
    ) STRICT;
    CREATE UNIQUE INDEX publication_one_pending ON publication_submissions(article_id) WHERE state = 'pending';
    CREATE TABLE publication_operations (
      actor TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(actor,id)
    ) STRICT;
    CREATE TABLE publication_audit (
      id INTEGER PRIMARY KEY, article_id TEXT NOT NULL, submission_id TEXT, actor TEXT NOT NULL,
      action TEXT NOT NULL, version INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    ) STRICT;
    PRAGMA user_version = 3;
  `);
}
