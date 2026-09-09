import type { DatabaseSync } from 'node:sqlite';
import type { EngagementCounts } from '../packages/core/src/social-protocol';
import { ensurePublicAuthor } from './social-schema';
import { publicationMissing } from './publication-errors';

export const readSocial = <T>(db: DatabaseSync, sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T | undefined;
export const countSocial = (db: DatabaseSync, sql: string, ...args: (string | number | null)[]) => readSocial<{ n: number }>(db, sql, ...args)!.n;
export function engagementCounts(db: DatabaseSync, articleId: string): EngagementCounts {
  return { likes: countSocial(db, 'SELECT COUNT(*) n FROM article_likes WHERE article_id=? AND active=1', articleId),
    comments: countSocial(db, "SELECT COUNT(*) n FROM article_comments WHERE article_id=? AND state='approved'", articleId),
    flowers: countSocial(db, "SELECT COUNT(*) n FROM flower_ledger WHERE article_id=? AND kind='gift_sent'", articleId) };
}
export function publicSocialFields(db: DatabaseSync, article: { id: string; user_id: string; audience_version: number }) {
  return { publicAuthorId: ensurePublicAuthor(db, article.user_id), audienceVersion: article.audience_version, counts: engagementCounts(db, article.id) };
}
export interface ReadableArticle { id: string; user_id: string; audience: 'account' | 'guest'; audience_version: number; published_id: string; content: string; version: number; first_published_at: string; asset_id: string }
export function readableArticle(db: DatabaseSync, articleId: string): ReadableArticle {
  const row = readSocial<ReadableArticle>(db, `SELECT a.id,a.user_id,a.audience,a.audience_version,a.published_id,a.version,a.first_published_at,s.content,s.asset_id
    FROM publication_articles a JOIN publication_submissions s ON s.id=a.published_id
    JOIN cloud_works w ON w.user_id=a.user_id AND w.id=a.work_id
    WHERE a.id=? AND s.state='approved' AND w.purged=0 AND w.deleted_at IS NULL`, articleId);
  if (!row) throw publicationMissing();
  return row;
}
