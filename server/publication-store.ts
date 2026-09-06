import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { articleText } from '../packages/core/src/writing';
import { aiDisclosureFor } from '../packages/core/src/article-ai';
import { stableJson, workSnapshotSchema } from '../packages/core/src/cloud-protocol';
import { publicationContentSchema, type PublicationContent, type PublicationStatus, type PublicationPreview, type SubmissionSummary,
  type PublicArticle, type PublicArticleCard, type PublicArticlePage, type PublicationSettingsInput, type SubmissionInput,
  type PublicationAction, type CoverCrops, type ImageVariant, type AdminArticle, type PublicationAudit } from '../packages/core/src/publication-protocol';
import { MiniIdentityStore, sha256 } from './mini-identity-store';
import { PublicationError, publicationConflict, publicationMissing } from './publication-errors';
import { processCover, type ProcessedCover } from './publication-images';

interface ArticleRow { id: string; user_id: string; work_id: string; version: number; settings_version: number; asset_id: string | null;
  pending_id: string | null; published_id: string | null; first_published_at: string | null; reason: string }
interface SubmissionRow { id: string; article_id: string; asset_id: string; content: string; state: SubmissionSummary['state'];
  reason: string; created_at: string; reviewed_at: string | null }
interface AssetRow { id: string; user_id: string; work_id: string; digest: string; master: Uint8Array; thumbnail: Uint8Array; reading: Uint8Array;
  width: number; height: number; crops: string; bytes: number }
const summary = (s: SubmissionRow): SubmissionSummary => ({ id: s.id, state: s.state, reason: s.reason, createdAt: s.created_at });
const read = <T>(db: DatabaseSync, sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T | undefined;
const contentOf = (s: SubmissionRow) => publicationContentSchema.parse(JSON.parse(s.content), { jitless: true });

export class PublicationStore {
  constructor(private readonly identity: MiniIdentityStore, private readonly now = Date.now, private readonly maxBytes = 100 * 1024 * 1024) {}
  private own<T>(token: string, action: (db: DatabaseSync, userId: string) => T) {
    return this.identity.accountTransaction(token, (db, session) => action(db, session.userId));
  }
  private work(db: DatabaseSync, userId: string, workId: string) {
    const row = read<{ version: number; snapshot: string | null; purged: number; deleted_at: string | null }>(db,
      'SELECT version,snapshot,purged,deleted_at FROM cloud_works WHERE user_id=? AND id=?', userId, workId);
    if (!row || row.purged || row.deleted_at || !row.snapshot) throw publicationMissing();
    return row as typeof row & { snapshot: string };
  }
  private article(db: DatabaseSync, userId: string, workId: string, create = false) {
    this.work(db, userId, workId);
    let row = read<ArticleRow>(db, 'SELECT * FROM publication_articles WHERE user_id=? AND work_id=?', userId, workId);
    if (!row && create) {
      db.prepare('INSERT INTO publication_articles(id,user_id,work_id) VALUES(?,?,?)').run(randomUUID(), userId, workId);
      row = read<ArticleRow>(db, 'SELECT * FROM publication_articles WHERE user_id=? AND work_id=?', userId, workId);
    }
    return row;
  }
  private submission(db: DatabaseSync, id: string | null) { return id ? read<SubmissionRow>(db, 'SELECT * FROM publication_submissions WHERE id=?', id) : undefined; }
  private asset(db: DatabaseSync, userId: string, workId: string, assetId: string) {
    const row = read<AssetRow>(db, 'SELECT * FROM publication_assets WHERE id=? AND user_id=? AND work_id=?', assetId, userId, workId);
    if (!row) throw publicationMissing();
    return row;
  }
  private statusOf(db: DatabaseSync, workId: string, article?: ArticleRow): PublicationStatus {
    const pending = this.submission(db, article?.pending_id ?? null);
    const last = article ? read<SubmissionRow>(db, 'SELECT * FROM publication_submissions WHERE article_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1', article.id) : undefined;
    const asset = article?.asset_id ? this.asset(db, article.user_id, workId, article.asset_id) : undefined;
    return { workId, articleId: article?.id ?? null, version: article?.version ?? 0,
      settings: { version: article?.settings_version ?? 0, assetId: article?.asset_id ?? null, crops: asset ? JSON.parse(asset.crops) as CoverCrops : null },
      pending: pending ? summary(pending) : null, published: Boolean(article?.published_id), lastSubmission: last ? summary(last) : null, reason: article?.reason ?? '' };
  }
  status(token: string, workId: string) { return this.own(token, (db, user) => this.statusOf(db, workId, this.article(db, user, workId))); }
  statuses(token: string) {
    return this.own(token, (db, user) => {
      const rows = db.prepare('SELECT a.* FROM publication_articles a JOIN cloud_works w ON w.user_id=a.user_id AND w.id=a.work_id WHERE a.user_id=? AND w.purged=0 AND w.deleted_at IS NULL').all(user) as unknown as ArticleRow[];
      return { publications: rows.map(row => this.statusOf(db, row.work_id, row)) };
    });
  }
  private receipt<T>(db: DatabaseSync, actor: string, id: string, input: unknown): T | undefined {
    const row = read<{ digest: string; result: string }>(db, 'SELECT digest,result FROM publication_operations WHERE actor=? AND id=?', actor, id);
    if (!row) return undefined;
    if (row.digest !== sha256(stableJson(input))) throw new PublicationError(409, 'operation_mismatch', '操作内容已变化，请刷新后重试。');
    return JSON.parse(row.result) as T;
  }
  private remember<T>(db: DatabaseSync, actor: string, id: string, input: unknown, result: T) {
    db.prepare('INSERT INTO publication_operations(actor,id,digest,result,created_at) VALUES(?,?,?,?,?)')
      .run(actor, id, sha256(stableJson(input)), JSON.stringify(result), this.now());
    return result;
  }
  private clean(db: DatabaseSync) {
    db.prepare('DELETE FROM publication_assets WHERE created_at < ? AND id NOT IN (SELECT asset_id FROM publication_articles WHERE asset_id IS NOT NULL) AND id NOT IN (SELECT asset_id FROM publication_submissions)')
      .run(this.now() - 7 * 86400_000);
  }
  cleanup() { this.identity.publicationTransaction(db => this.clean(db)); }
  private capacity(db: DatabaseSync, userId: string, extra: number) {
    this.clean(db);
    const assets = read<{ total: number }>(db, 'SELECT COALESCE(SUM(bytes),0) AS total FROM publication_assets WHERE user_id=?', userId)!.total;
    const submissions = read<{ total: number }>(db, 'SELECT COALESCE(SUM(s.bytes),0) AS total FROM publication_submissions s JOIN publication_articles a ON a.id=s.article_id WHERE a.user_id=?', userId)!.total;
    if (assets + submissions + extra > this.maxBytes) throw new PublicationError(413, 'publication_capacity', '发表空间已满，请整理不需要的文章后重试。');
  }
  private insertAsset(db: DatabaseSync, id: string, user: string, work: string, digest: string, image: ProcessedCover) {
    this.capacity(db, user, image.bytes);
    db.prepare('INSERT INTO publication_assets(id,user_id,work_id,digest,master,thumbnail,reading,width,height,crops,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, user, work, digest, image.master, image.thumbnail, image.reading, image.width, image.height, JSON.stringify(image.crops), image.bytes, this.now());
  }
  async upload(token: string, workId: string, id: string, raw: Buffer) {
    const digest = createHash('sha256').update(raw).digest('hex');
    const existing = this.own(token, (db, user) => {
      this.work(db, user, workId);
      const asset = read<AssetRow>(db, 'SELECT * FROM publication_assets WHERE id=?', id);
      if (asset && (asset.user_id !== user || asset.work_id !== workId || asset.digest !== digest)) throw publicationConflict();
      return asset;
    });
    if (existing) return { assetId: existing.id, width: existing.width, height: existing.height, crops: JSON.parse(existing.crops) as CoverCrops };
    const image = await processCover(raw);
    return this.own(token, (db, user) => {
      this.work(db, user, workId);
      const late = read<AssetRow>(db, 'SELECT * FROM publication_assets WHERE id=?', id);
      if (late && (late.user_id !== user || late.work_id !== workId || late.digest !== digest)) throw publicationConflict();
      if (!late) this.insertAsset(db, id, user, workId, digest, image);
      return { assetId: id, width: image.width, height: image.height, crops: image.crops };
    });
  }
  async settings(token: string, workId: string, input: PublicationSettingsInput) {
    const operation = { kind: 'settings', workId, ...input };
    const ready = this.own(token, (db, user) => {
      this.work(db, user, workId);
      const receipt = this.receipt<{ settingsVersion: number; assetId: string }>(db, user, input.operationId, operation);
      if (receipt) return { receipt };
      if ((this.article(db, user, workId)?.settings_version ?? 0) !== input.expectedVersion) throw publicationConflict();
      return { source: Buffer.from(this.asset(db, user, workId, input.assetId).master) };
    });
    if (ready.receipt) return ready.receipt;
    const image = await processCover(ready.source!, input.crops);
    return this.own(token, (db, user) => {
      const article = this.article(db, user, workId, true)!;
      const receipt = this.receipt<{ settingsVersion: number; assetId: string }>(db, user, input.operationId, operation);
      if (receipt) return receipt;
      if (article.settings_version !== input.expectedVersion) throw publicationConflict();
      this.asset(db, user, workId, input.assetId);
      const assetId = randomUUID();
      this.insertAsset(db, assetId, user, workId, sha256(stableJson(operation)), image);
      db.prepare('UPDATE publication_articles SET asset_id=?,settings_version=settings_version+1 WHERE id=?').run(assetId, article.id);
      return this.remember(db, user, input.operationId, operation, { settingsVersion: article.settings_version + 1, assetId });
    });
  }
  private previewOf(db: DatabaseSync, user: string, workId: string): PublicationPreview {
    const work = this.work(db, user, workId), article = this.article(db, user, workId);
    if (!article?.asset_id) throw new PublicationError(400, 'cover_required', '请先选择文章封面。');
    const snapshot = workSnapshotSchema.parse(JSON.parse(work.snapshot), { jitless: true });
    const title = snapshot.work.draft.title.trim(), body = articleText(snapshot.work.segments);
    if (!title || !body.trim()) throw new PublicationError(400, 'content_required', '请先填写标题和正文。');
    const author = read<{ nickname: string }>(db, 'SELECT nickname FROM mini_accounts WHERE user_id=?', user)!;
    return { ...publicationContentSchema.parse({ title, body, authorName: author.nickname,
      aiAssisted: aiDisclosureFor(workId, snapshot.session).aiAssisted }, { jitless: true }),
      articleId: article.id, assetId: article.asset_id, workVersion: work.version, settingsVersion: article.settings_version, version: article.version };
  }
  preview(token: string, workId: string) { return this.own(token, (db, user) => this.previewOf(db, user, workId)); }
  submit(token: string, workId: string, input: SubmissionInput) {
    return this.own(token, (db, user) => {
      this.work(db, user, workId);
      const operation = { kind: 'submit', workId, ...input };
      const receipt = this.receipt<{ submissionId: string; articleId: string; version: number }>(db, user, input.operationId, operation);
      if (receipt) return receipt;
      const preview = this.previewOf(db, user, workId), article = this.article(db, user, workId)!;
      if (article.pending_id || preview.workVersion !== input.workVersion || preview.settingsVersion !== input.settingsVersion ||
          preview.authorName !== input.authorName || preview.version !== input.expectedVersion) throw publicationConflict();
      const content: PublicationContent = { title: preview.title, body: preview.body, authorName: preview.authorName, aiAssisted: preview.aiAssisted };
      const raw = JSON.stringify(content), id = randomUUID(), now = new Date(this.now()).toISOString();
      this.capacity(db, user, Buffer.byteLength(raw));
      db.prepare("INSERT INTO publication_submissions(id,article_id,asset_id,content,bytes,work_version,settings_version,state,created_at) VALUES(?,?,?,?,?,?,?,'pending',?)")
        .run(id, article.id, preview.assetId, raw, Buffer.byteLength(raw), input.workVersion, input.settingsVersion, now);
      db.prepare("UPDATE publication_articles SET pending_id=?,version=version+1,reason='' WHERE id=?").run(id, article.id);
      this.audit(db, article.id, id, user, 'submit', article.version + 1, '');
      return this.remember(db, user, input.operationId, operation, { submissionId: id, articleId: article.id, version: article.version + 1 });
    });
  }
  private audit(db: DatabaseSync, article: string, submission: string | null, actor: string, action: string, version: number, reason: string) {
    db.prepare('INSERT INTO publication_audit(article_id,submission_id,actor,action,version,reason,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(article, submission, actor, action, version, reason, new Date(this.now()).toISOString());
  }
  private mutate(db: DatabaseSync, article: ArticleRow, actor: string, input: PublicationAction) {
    const operation = { articleId: article.id, ...input };
    const receipt = this.receipt<{ version: number }>(db, actor, input.operationId, operation);
    if (receipt) return receipt;
    this.work(db, article.user_id, article.work_id);
    if (article.version !== input.expectedVersion) throw publicationConflict();
    const now = new Date(this.now()).toISOString();
    if (input.action === 'approve' || input.action === 'reject' || input.action === 'withdraw-review') {
      if (!article.pending_id || this.submission(db, article.pending_id)?.state !== 'pending') throw publicationConflict();
      if (input.action === 'reject' && !input.reason) throw new PublicationError(400, 'reason_required', '请填写未通过原因。');
      const state = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'withdrawn';
      db.prepare('UPDATE publication_submissions SET state=?,reason=?,reviewed_at=? WHERE id=?').run(state, input.reason, now, article.pending_id);
      if (input.action === 'approve') db.prepare("UPDATE publication_articles SET published_id=pending_id,first_published_at=COALESCE(first_published_at,?),reason='' WHERE id=?").run(now, article.id);
      db.prepare('UPDATE publication_articles SET pending_id=NULL,version=version+1 WHERE id=?').run(article.id);
    } else {
      if (input.action === 'takedown' && !input.reason) throw new PublicationError(400, 'reason_required', '请填写下架原因。');
      if (!article.published_id && !article.pending_id) throw publicationConflict();
      db.prepare("UPDATE publication_submissions SET state='withdrawn',reviewed_at=? WHERE article_id=? AND state='pending'").run(now, article.id);
      db.prepare('UPDATE publication_articles SET pending_id=NULL,published_id=NULL,version=version+1,reason=? WHERE id=?')
        .run(input.action === 'takedown' ? input.reason : '作者已撤回发表', article.id);
    }
    this.audit(db, article.id, article.pending_id, actor, input.action, article.version + 1, input.reason);
    return this.remember(db, actor, input.operationId, operation, { version: article.version + 1 });
  }
  withdraw(token: string, workId: string, input: PublicationAction) {
    if (!['withdraw', 'withdraw-review'].includes(input.action)) throw new PublicationError(403, 'forbidden_action', '不允许此操作。');
    return this.own(token, (db, user) => {
      const article = this.article(db, user, workId);
      if (!article) throw publicationMissing();
      return this.mutate(db, article, user, input);
    });
  }
  private publicRow(db: DatabaseSync, id: string) {
    const article = read<ArticleRow>(db, 'SELECT a.* FROM publication_articles a JOIN cloud_works w ON a.user_id=w.user_id AND a.work_id=w.id WHERE a.id=? AND a.published_id IS NOT NULL AND w.purged=0 AND w.deleted_at IS NULL', id);
    const submission = article && this.submission(db, article.published_id);
    if (!article || !submission || submission.state !== 'approved') throw publicationMissing();
    return { article, submission };
  }
  private publicContent(article: ArticleRow, submission: SubmissionRow): PublicArticle {
    return { ...contentOf(submission), id: article.id, version: article.version, publishedAt: article.first_published_at! };
  }
  publicArticle(token: string, id: string) { return this.own(token, db => { const { article, submission } = this.publicRow(db, id); return this.publicContent(article, submission); }); }
  publicList(token: string, cursor?: string): PublicArticlePage {
    let position: { time: string; id: string } | undefined;
    if (cursor) {
      try {
        position = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof position;
        if (!position || typeof position.time !== 'string' || !Number.isFinite(Date.parse(position.time)) || typeof position.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(position.id)) throw new Error();
      } catch { throw new PublicationError(400, 'invalid_cursor', '列表位置无效，请刷新。'); }
    }
    return this.own(token, db => {
      const rows = db.prepare(`SELECT a.* FROM publication_articles a JOIN cloud_works w ON a.user_id=w.user_id AND a.work_id=w.id
        WHERE a.published_id IS NOT NULL AND w.deleted_at IS NULL AND w.purged=0
        AND (? IS NULL OR a.first_published_at < ? OR (a.first_published_at=? AND a.id < ?))
        ORDER BY a.first_published_at DESC,a.id DESC LIMIT 21`).all(position?.time ?? null, position?.time ?? null, position?.time ?? null, position?.id ?? null) as unknown as ArticleRow[];
      const page = rows.slice(0, 20), last = page.at(-1);
      const articles: PublicArticleCard[] = page.map(a => { const item = this.publicContent(a, this.submission(db, a.published_id)!);
        return { id: item.id, title: item.title, authorName: item.authorName, aiAssisted: item.aiAssisted, version: item.version, publishedAt: item.publishedAt }; });
      return { articles, cursor: rows.length > 20 && last ? Buffer.from(JSON.stringify({ time: last.first_published_at, id: last.id })).toString('base64url') : null };
    });
  }
  ownImage(token: string, workId: string, assetId: string, variant: ImageVariant) {
    return this.own(token, (db, user) => { this.work(db, user, workId); return Buffer.from(this.asset(db, user, workId, assetId)[variant]); });
  }
  publicImage(token: string, id: string, variant: 'thumbnail' | 'reading') {
    return this.own(token, db => { const { article, submission } = this.publicRow(db, id); return Buffer.from(this.asset(db, article.user_id, article.work_id, submission.asset_id)[variant]); });
  }
  ownSubmission(token: string, workId: string, id: string) {
    return this.own(token, (db, user) => {
      const article = this.article(db, user, workId), submission = this.submission(db, id);
      if (!article || submission?.article_id !== article.id) throw publicationMissing();
      return { ...contentOf(submission), ...summary(submission), assetId: submission.asset_id };
    });
  }
  adminList(state: 'pending' | 'published' | 'history', offset = 0) {
    return this.identity.publicationTransaction(db => {
      const reference = state === 'pending' ? 'a.pending_id' : state === 'published' ? 'a.published_id' : '(SELECT id FROM publication_submissions WHERE article_id=a.id ORDER BY created_at DESC,rowid DESC LIMIT 1)';
      const rows = db.prepare(`SELECT a.id,s.id AS submissionId FROM publication_articles a JOIN publication_submissions s ON s.id=${reference} ORDER BY s.created_at ${state === 'pending' ? 'ASC' : 'DESC'},a.id LIMIT 21 OFFSET ?`).all(offset) as { id: string; submissionId: string }[];
      return { articles: rows.slice(0, 20).map(row => this.adminDetailOf(db, row.id, row.submissionId)), cursor: rows.length > 20 ? offset + 20 : null };
    });
  }
  private adminDetailOf(db: DatabaseSync, id: string, submissionId?: string): AdminArticle {
    const article = read<ArticleRow>(db, 'SELECT * FROM publication_articles WHERE id=?', id);
    const submission = this.submission(db, submissionId ?? article?.pending_id ?? article?.published_id ?? null);
    if (!article || submission?.article_id !== id) throw publicationMissing();
    return { ...contentOf(submission), id, version: article.version, submission: summary(submission), published: Boolean(article.published_id), publishedAt: article.first_published_at };
  }
  adminDetail(id: string, submissionId?: string) { return this.identity.publicationTransaction(db => this.adminDetailOf(db, id, submissionId)); }
  adminImage(id: string, submissionId: string, variant: 'thumbnail' | 'reading') {
    return this.identity.publicationTransaction(db => {
      this.adminDetailOf(db, id, submissionId);
      const article = read<ArticleRow>(db, 'SELECT * FROM publication_articles WHERE id=?', id)!;
      const submission = this.submission(db, submissionId)!;
      return Buffer.from(this.asset(db, article.user_id, article.work_id, submission.asset_id)[variant]);
    });
  }
  adminAction(id: string, actor: () => string, input: PublicationAction) {
    if (!['approve', 'reject', 'takedown'].includes(input.action)) throw new PublicationError(403, 'forbidden_action', '不允许此操作。');
    return this.identity.publicationTransaction(db => {
      const name = actor(), article = read<ArticleRow>(db, 'SELECT * FROM publication_articles WHERE id=?', id);
      if (!article) throw publicationMissing();
      return this.mutate(db, article, 'admin:' + name, input);
    });
  }
  audits(id: string): PublicationAudit[] {
    return this.identity.publicationTransaction(db => {
      // Audit access also requires that at least one submitted snapshot is still retained.
      const exists = read<{ id: string }>(db, 'SELECT id FROM publication_submissions WHERE article_id=? LIMIT 1', id);
      if (!exists) throw publicationMissing();
      const entries = db.prepare('SELECT id,action,actor,version,reason,created_at AS createdAt FROM publication_audit WHERE article_id=? ORDER BY id DESC LIMIT 100').all(id) as unknown as PublicationAudit[];
      return entries.map(entry => ({ ...entry, actor: entry.actor.startsWith('admin:') ? entry.actor.slice(6) : '作者' }));
    });
  }
}
