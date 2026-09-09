import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/** Runs inside the same transaction as every preceding identity migration. */
export function migrateSocial(database: DatabaseSync) {
  database.exec(`
    ALTER TABLE publication_articles ADD COLUMN audience TEXT NOT NULL DEFAULT 'account' CHECK(audience IN ('account','guest'));
    ALTER TABLE publication_articles ADD COLUMN audience_version INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE public_authors (public_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES mini_accounts(user_id)) STRICT;
    CREATE TABLE publication_audience_consents (id INTEGER PRIMARY KEY, article_id TEXT NOT NULL, actor TEXT NOT NULL,
      audience TEXT NOT NULL, version INTEGER NOT NULL, consent_version TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
    CREATE TABLE article_likes (user_id TEXT NOT NULL, article_id TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
      version INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,article_id)) STRICT;
    CREATE INDEX article_likes_article ON article_likes(article_id,active);
    CREATE TABLE article_collections (user_id TEXT NOT NULL, article_id TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
      version INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,article_id)) STRICT;
    CREATE INDEX article_collections_list ON article_collections(user_id,active,created_at DESC,article_id DESC);
    CREATE TABLE author_follows (follower_id TEXT NOT NULL, followed_id TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
      version INTEGER NOT NULL, created_at TEXT NOT NULL, CHECK(follower_id != followed_id), PRIMARY KEY(follower_id,followed_id)) STRICT;
    CREATE INDEX author_followers ON author_follows(followed_id,active,follower_id);
    CREATE INDEX author_follows_recent ON author_follows(follower_id,active,created_at DESC,followed_id DESC);
    CREATE INDEX author_followers_recent ON author_follows(followed_id,active,created_at DESC,follower_id DESC);
    CREATE TABLE article_comments (id TEXT PRIMARY KEY, article_id TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected','hidden','deleted')), version INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, published_at TEXT) STRICT;
    CREATE INDEX article_comments_public ON article_comments(article_id,state,created_at DESC,id DESC);
    CREATE INDEX article_comments_published ON article_comments(article_id,state,published_at DESC,id DESC);
    CREATE INDEX article_comments_queue ON article_comments(state,created_at DESC,id DESC);
    CREATE INDEX article_comments_owner ON article_comments(user_id,article_id,created_at DESC);
    CREATE TABLE comment_reports (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','resolved')), version INTEGER NOT NULL, created_at TEXT NOT NULL, resolution TEXT NOT NULL DEFAULT '') STRICT;
    CREATE INDEX comment_reports_queue ON comment_reports(state,created_at DESC,id DESC);
    CREATE TABLE comment_audit (id INTEGER PRIMARY KEY, comment_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
      version INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL) STRICT;
    CREATE TABLE flower_accounts (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0), version INTEGER NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE flower_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('daily_grant','gift_sent')),
      amount INTEGER NOT NULL, day TEXT NOT NULL, article_id TEXT, author_id TEXT, operation_id TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id,operation_id)) STRICT;
    CREATE UNIQUE INDEX flower_daily_grant ON flower_ledger(user_id,day) WHERE kind='daily_grant';
    CREATE INDEX flower_article ON flower_ledger(article_id,kind);
    CREATE INDEX flower_author ON flower_ledger(author_id,kind);
    CREATE INDEX flower_owner_history ON flower_ledger(user_id,kind,created_at DESC,id DESC);
    CREATE INDEX author_articles_recent ON publication_articles(user_id,first_published_at DESC,id DESC);
    CREATE TABLE social_operations (actor TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL,
      article_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(actor,id)) STRICT;
    CREATE TABLE social_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, article_id TEXT NOT NULL, event TEXT NOT NULL,
      action TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
    CREATE INDEX social_events_expiry ON social_events(created_at);
    CREATE INDEX social_events_session ON social_events(session_id,created_at);
    CREATE TABLE social_daily_metrics (day TEXT NOT NULL, event TEXT NOT NULL, action TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY(day,event,action)) STRICT;
    PRAGMA user_version = 4;
  `);
  const insert = database.prepare('INSERT INTO public_authors(public_id,user_id) VALUES(?,?)');
  for (const row of database.prepare('SELECT user_id FROM mini_accounts').all()) insert.run(randomUUID(), row.user_id!);
}

export function ensurePublicAuthor(database: DatabaseSync, userId: string): string {
  const existing = database.prepare('SELECT public_id FROM public_authors WHERE user_id=?').get(userId);
  if (existing) return String(existing.public_id);
  const id = randomUUID();
  database.prepare('INSERT INTO public_authors(public_id,user_id) VALUES(?,?)').run(id, userId);
  return id;
}
