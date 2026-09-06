import type { DatabaseSync } from 'node:sqlite';

export function revokeWorkPublication(database: DatabaseSync, userId: string, workId: string, purge: boolean, now: string) {
  const row = database.prepare('SELECT id,version FROM publication_articles WHERE user_id=? AND work_id=?').get(userId, workId) as { id: string; version: number } | undefined;
  if (row) {
    database.prepare("UPDATE publication_submissions SET state='withdrawn',reviewed_at=? WHERE article_id=? AND state='pending'").run(now, row.id);
    database.prepare("UPDATE publication_articles SET pending_id=NULL,published_id=NULL,version=version+1,reason='作品已删除' WHERE id=?").run(row.id);
    database.prepare('INSERT INTO publication_audit(article_id,actor,action,version,created_at) VALUES(?,?,?,?,?)')
      .run(row.id, userId, purge ? 'purge' : 'trash', row.version + 1, now);
    if (purge) {
      database.prepare('DELETE FROM publication_submissions WHERE article_id=?').run(row.id);
      database.prepare('UPDATE publication_articles SET asset_id=NULL,settings_version=settings_version+1 WHERE id=?').run(row.id);
      database.prepare("UPDATE publication_audit SET reason='' WHERE article_id=?").run(row.id);
    }
  }
  if (purge) database.prepare('DELETE FROM publication_assets WHERE user_id=? AND work_id=?').run(userId, workId);
}
