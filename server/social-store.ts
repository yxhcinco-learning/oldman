import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { stableJson } from '../packages/core/src/cloud-protocol';
import { publicationContentSchema, type PublicArticle, type PublicArticleCard, type PublicArticlePage } from '../packages/core/src/publication-protocol';
import { audienceInputSchema, commentInputSchema, giftInputSchema, socialMutationSchema, type AudienceInput, type SocialMutation,
  type Engagement, type FollowState, type FlowerWallet, type GiftReceipt, type PublicAuthor, type AuthorProfile, type OwnComment,
  type PublicComment, type CommentPage, type CommentInput, type CommentReview, type CollectionPage, type RelationshipPage,
  type AdminComment, type AdminCommentPage, type AdminCommentReport, type AdminReportPage, type CommentAudit, type SocialEventInput,
  type ReactionResult, type FlowerHistoryPage } from '../packages/core/src/social-protocol';
import { MiniIdentityStore, sha256 } from './mini-identity-store';
import { PublicationError, publicationConflict, publicationMissing } from './publication-errors';
import { engagementCounts, publicSocialFields, readableArticle, readSocial as read, countSocial as count, type ReadableArticle } from './social-projection';
import { ensurePublicAuthor } from './social-schema';

export interface SocialOptions { now?: () => number; writesEnabled?: boolean; guestOpeningEnabled?: boolean; commentsEnabled?: boolean }
interface RelationRow { active: number; version: number }
interface CommentRow { id: string; article_id: string; user_id: string; text: string; state: OwnComment['state']; version: number; reason: string; created_at: string; published_at: string | null }
const invalid = (code: string, message: string, status = 400) => new PublicationError(status, code, message);
interface ListPosition { time: string; id: string }
const position = (cursor?: string): ListPosition | undefined => {
  if (!cursor) return undefined;
  try {
    if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length !== 2 || typeof row.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.time)
      || !Number.isFinite(Date.parse(row.time)) || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)) throw new Error();
    return { time: row.time, id: row.id };
  } catch { throw invalid('invalid_cursor', '列表位置无效，请刷新。'); }
};
const positionArgs = (after: ListPosition | undefined) => [after?.time ?? null, after?.time ?? null, after?.time ?? null, after?.id ?? null];
const pageCursor = <T extends { id: string; position_time: string }>(rows: T[]) => rows.length > 20
  ? Buffer.from(JSON.stringify({ time: rows[19]!.position_time, id: rows[19]!.id })).toString('base64url') : null;

export class SocialStore {
  private readonly now: () => number;
  readonly writesEnabled: boolean;
  readonly guestOpeningEnabled: boolean;
  readonly commentsEnabled: boolean;
  constructor(private readonly identity: MiniIdentityStore, options: SocialOptions = {}) {
    this.now = options.now ?? Date.now; this.writesEnabled = options.writesEnabled ?? true;
    this.guestOpeningEnabled = options.guestOpeningEnabled ?? true; this.commentsEnabled = options.commentsEnabled ?? true;
  }
  private own<T>(token: string, action: (db: DatabaseSync, user: string) => T) { return this.identity.accountTransaction(token, (db, session) => action(db, session.userId)); }
  private access<T>(token: string | undefined, action: (db: DatabaseSync, user: string | undefined) => T) {
    return token === undefined ? this.identity.publicationTransaction(db => action(db, undefined)) : this.own(token, action);
  }
  private stamp() { return new Date(this.now()).toISOString(); }
  private day() { return new Date(this.now() + 8 * 3600_000).toISOString().slice(0, 10); }
  private write(comments = false) { if (!this.writesEnabled || comments && !this.commentsEnabled) throw invalid('social_disabled', '互动暂未开放，请稍后再试。', 503); }
  private receipt<T>(db: DatabaseSync, actor: string, id: string, input: unknown): T | undefined {
    const row = read<{ digest: string; result: string }>(db, 'SELECT digest,result FROM social_operations WHERE actor=? AND id=?', actor, id);
    if (!row) return undefined;
    if (row.digest !== sha256(stableJson(input))) throw invalid('operation_mismatch', '操作内容已变化，请刷新后重试。', 409);
    return JSON.parse(row.result) as T;
  }
  private remember<T>(db: DatabaseSync, actor: string, id: string, input: unknown, result: T, articleId?: string, event?: string) {
    db.prepare('INSERT INTO social_operations(actor,id,digest,result,article_id,created_at) VALUES(?,?,?,?,?,?)')
      .run(actor, id, sha256(stableJson(input)), JSON.stringify(result), articleId ?? null, this.now());
    if (event) this.metric(db, 'interaction_confirmed', event);
    return result;
  }
  private metric(db: DatabaseSync, event: string, action: string) {
    db.prepare('INSERT INTO social_daily_metrics(day,event,action,count) VALUES(?,?,?,1) ON CONFLICT(day,event,action) DO UPDATE SET count=count+1').run(this.day(), event, action);
  }
  private content(db: DatabaseSync, article: ReadableArticle): PublicArticle {
    return { ...publicationContentSchema.parse(JSON.parse(article.content), { jitless: true }), id: article.id, version: article.version,
      publishedAt: article.first_published_at, ...publicSocialFields(db, article) };
  }
  private card(db: DatabaseSync, article: ReadableArticle): PublicArticleCard {
    const { body, ...value } = this.content(db, article);
    return { ...value, excerpt: Array.from(body.replace(/\s+/gu, ' ').trim()).slice(0, 120).join('') };
  }
  article(articleId: string) { return this.access(undefined, db => this.content(db, readableArticle(db, articleId))); }
  image(articleId: string, variant: 'thumbnail' | 'reading') {
    return this.access(undefined, db => {
      const article = readableArticle(db, articleId);
      const row = read<{ image: Uint8Array }>(db, `SELECT ${variant} image FROM publication_assets WHERE id=?`, article.asset_id);
      if (!row) throw publicationMissing();
      return Buffer.from(row.image);
    });
  }
  audience(token: string, workId: string, input: AudienceInput) {
    audienceInputSchema.parse(input, { jitless: true });
    return this.own(token, (db, user) => {
      const operation = { kind: 'audience', workId, ...input };
      const receipt = this.receipt<{ audience: 'account' | 'guest'; audienceVersion: number }>(db, user, input.operationId, operation);
      if (receipt) return receipt;
      const article = read<{ id: string; audience: 'account' | 'guest'; audience_version: number }>(db,
        `SELECT a.id,a.audience,a.audience_version FROM publication_articles a JOIN cloud_works w ON w.user_id=a.user_id AND w.id=a.work_id
         WHERE a.user_id=? AND a.work_id=? AND w.purged=0 AND w.deleted_at IS NULL`, user, workId);
      if (!article) throw publicationMissing();
      if (article.audience_version !== input.expectedVersion) throw publicationConflict();
      if (input.audience === 'guest' && !this.guestOpeningEnabled) throw invalid('guest_opening_disabled', '暂时无法新增游客公开。', 503);
      const version = article.audience_version + 1;
      db.prepare('UPDATE publication_articles SET audience=?,audience_version=? WHERE id=?').run(input.audience, version, article.id);
      db.prepare('INSERT INTO publication_audience_consents(article_id,actor,audience,version,consent_version,created_at) VALUES(?,?,?,?,?,?)')
        .run(article.id, user, input.audience, version, input.consentVersion, this.stamp());
      return this.remember(db, user, input.operationId, operation, { audience: input.audience, audienceVersion: version }, article.id);
    });
  }
  private authorUser(db: DatabaseSync, publicId: string) {
    const row = read<{ user_id: string }>(db, 'SELECT user_id FROM public_authors WHERE public_id=?', publicId);
    if (!row) throw publicationMissing(); return row.user_id;
  }
  private profile(db: DatabaseSync, user: string): PublicAuthor {
    const name = read<{ nickname: string }>(db, 'SELECT nickname FROM mini_accounts WHERE user_id=?', user);
    if (!name) throw publicationMissing();
    return { id: ensurePublicAuthor(db, user), name: name.nickname, avatar: 'default',
      following: count(db, 'SELECT COUNT(*) n FROM author_follows WHERE follower_id=? AND active=1', user),
      followers: count(db, 'SELECT COUNT(*) n FROM author_follows WHERE followed_id=? AND active=1', user),
      flowers: count(db, "SELECT COUNT(*) n FROM flower_ledger WHERE author_id=? AND kind='gift_sent'", user),
      articles: count(db, `SELECT COUNT(*) n FROM publication_articles a JOIN publication_submissions s ON s.id=a.published_id
        JOIN cloud_works w ON w.user_id=a.user_id AND w.id=a.work_id WHERE a.user_id=? AND s.state='approved'
        AND w.purged=0 AND w.deleted_at IS NULL`, user) };
  }
  private relationship(db: DatabaseSync, user: string, target: string): FollowState {
    const row = read<RelationRow>(db, 'SELECT active,version FROM author_follows WHERE follower_id=? AND followed_id=?', user, target);
    const reverse = read<RelationRow>(db, 'SELECT active,version FROM author_follows WHERE follower_id=? AND followed_id=?', target, user);
    const active = Boolean(row?.active), followedBy = Boolean(reverse?.active);
    return { active, version: row?.version ?? 0, followedBy, mutual: active && followedBy, self: user === target };
  }
  author(publicId: string, token?: string): AuthorProfile {
    return this.access(token, (db, user) => { const target = this.authorUser(db, publicId); return { ...this.profile(db, target),
      ...(user ? { relationship: this.relationship(db, user, target) } : {}) }; });
  }
  authorArticles(publicId: string, token?: string, cursor?: string): PublicArticlePage {
    const after = position(cursor);
    return this.access(token, db => {
      const target = this.authorUser(db, publicId);
      const rows = db.prepare(`SELECT a.id,a.first_published_at position_time FROM publication_articles a JOIN publication_submissions s ON s.id=a.published_id
        JOIN cloud_works w ON w.user_id=a.user_id AND w.id=a.work_id WHERE a.user_id=? AND s.state='approved' AND w.purged=0 AND w.deleted_at IS NULL
        AND (? IS NULL OR a.first_published_at<? OR (a.first_published_at=? AND a.id<?))
        ORDER BY a.first_published_at DESC,a.id DESC LIMIT 21`).all(target, ...positionArgs(after)) as { id: string; position_time: string }[];
      return { articles: rows.slice(0, 20).map(row => this.card(db, readableArticle(db, row.id))), cursor: pageCursor(rows) };
    });
  }
  follow(token: string, publicId: string, input: SocialMutation): FollowState {
    socialMutationSchema.parse(input, { jitless: true });
    return this.own(token, (db, user) => {
      const operation = { kind: 'follow', publicId, ...input }, receipt = this.receipt<FollowState>(db, user, input.operationId, operation);
      if (receipt) return receipt; this.write();
      const target = this.authorUser(db, publicId); if (target === user) throw invalid('self_follow', '不能关注自己。');
      const state = this.relationship(db, user, target); if (state.version !== input.expectedVersion) throw publicationConflict();
      db.prepare(`INSERT INTO author_follows(follower_id,followed_id,active,version,created_at) VALUES(?,?,?,?,?)
        ON CONFLICT(follower_id,followed_id) DO UPDATE SET active=excluded.active,version=excluded.version,created_at=excluded.created_at`)
        .run(user, target, Number(input.active), state.version + 1, this.stamp());
      return this.remember(db, user, input.operationId, operation, this.relationship(db, user, target), undefined, 'follow');
    });
  }
  reaction(token: string, articleId: string, kind: 'like' | 'collection', input: SocialMutation): ReactionResult {
    socialMutationSchema.parse(input, { jitless: true });
    return this.own(token, (db, user) => {
      const operation = { kind, articleId, ...input }, receipt = this.receipt<ReactionResult>(db, user, input.operationId, operation);
      if (receipt) return receipt; this.write();
      if (kind !== 'collection' || input.active) readableArticle(db, articleId);
      const table = kind === 'like' ? 'article_likes' : 'article_collections';
      const row = read<RelationRow>(db, `SELECT active,version FROM ${table} WHERE user_id=? AND article_id=?`, user, articleId);
      if ((row?.version ?? 0) !== input.expectedVersion) throw publicationConflict();
      if (kind === 'collection' && !input.active && !row) throw publicationMissing();
      const version = (row?.version ?? 0) + 1;
      db.prepare(`INSERT INTO ${table}(user_id,article_id,active,version,created_at) VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,article_id) DO UPDATE SET active=excluded.active,version=excluded.version,created_at=excluded.created_at`)
        .run(user, articleId, Number(input.active), version, this.stamp());
      return this.remember(db, user, input.operationId, operation, { active: input.active, version, counts: engagementCounts(db, articleId) }, articleId, kind === 'like' ? 'like' : 'collect');
    });
  }
  private wallet(db: DatabaseSync, user: string): FlowerWallet {
    const row = read<{ balance: number; version: number }>(db, 'SELECT balance,version FROM flower_accounts WHERE user_id=?', user);
    return { balance: row?.balance ?? 0, version: row?.version ?? 0, today: this.day(), dailyAmount: 3,
      claimedToday: Boolean(read(db, "SELECT id FROM flower_ledger WHERE user_id=? AND day=? AND kind='daily_grant'", user, this.day())) };
  }
  flowers(token: string) { return this.own(token, (db, user) => this.wallet(db, user)); }
  claim(token: string) {
    return this.own(token, (db, user) => {
      if (this.wallet(db, user).claimedToday) return this.wallet(db, user); this.write();
      db.prepare('INSERT INTO flower_accounts(user_id,balance,version) VALUES(?,3,1) ON CONFLICT(user_id) DO UPDATE SET balance=balance+3,version=version+1').run(user);
      db.prepare("INSERT INTO flower_ledger(id,user_id,kind,amount,day,operation_id,created_at) VALUES(?,?,'daily_grant',3,?,?,?)")
        .run(randomUUID(), user, this.day(), 'grant:' + this.day(), this.stamp());
      return this.wallet(db, user);
    });
  }
  gift(token: string, articleId: string, input: { operationId: string; gift: 'flower' }): GiftReceipt {
    giftInputSchema.parse(input, { jitless: true });
    return this.own(token, (db, user) => {
      const operation = { kind: 'gift', articleId, ...input }, receipt = this.receipt<GiftReceipt>(db, user, input.operationId, operation);
      if (receipt) return receipt; this.write();
      const article = readableArticle(db, articleId);
      if (article.user_id === user) throw invalid('self_gift', '不能给自己的文章送花。');
      const changed = db.prepare('UPDATE flower_accounts SET balance=balance-1,version=version+1 WHERE user_id=? AND balance>=1').run(user);
      if (!changed.changes) throw invalid('insufficient_flowers', '小花花不足，明日可再领取。', 409);
      db.prepare("INSERT INTO flower_ledger(id,user_id,kind,amount,day,article_id,author_id,operation_id,created_at) VALUES(?,?,'gift_sent',-1,?,?,?,?,?)")
        .run(randomUUID(), user, this.day(), articleId, article.user_id, input.operationId, this.stamp());
      return this.remember(db, user, input.operationId, operation, { operationId: input.operationId, articleId, gift: 'flower' as const,
        sent: true as const, balance: this.wallet(db, user).balance, flowers: engagementCounts(db, articleId).flowers }, articleId, 'gift');
    });
  }
  flowerHistory(token: string, cursor?: string): FlowerHistoryPage {
    const after = position(cursor);
    return this.own(token, (db, user) => {
      const rows = db.prepare("SELECT id,article_id articleId,created_at position_time FROM flower_ledger WHERE user_id=? AND kind='gift_sent' AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21")
        .all(user, ...positionArgs(after)) as { id: string; articleId: string; position_time: string }[];
      return { entries: rows.slice(0, 20).map(row => ({ id: row.id, articleId: row.articleId, createdAt: row.position_time, amount: 1 as const })), cursor: pageCursor(rows) };
    });
  }
  private comment(db: DatabaseSync, id: string) { const row = read<CommentRow>(db, 'SELECT * FROM article_comments WHERE id=?', id); if (!row) throw publicationMissing(); return row; }
  private commentPublic(db: DatabaseSync, row: CommentRow): PublicComment {
    const author = this.profile(db, row.user_id);
    return { id: row.id, articleId: row.article_id, publicAuthorId: author.id, authorName: author.name, avatar: 'default', text: row.text,
      createdAt: row.published_at ?? row.created_at, version: row.version };
  }
  private commentOwn(db: DatabaseSync, row: CommentRow): OwnComment { return { ...this.commentPublic(db, row), state: row.state, reason: row.reason }; }
  comments(articleId: string, token?: string, cursor?: string): CommentPage {
    const after = position(cursor);
    return this.access(token, db => {
      readableArticle(db, articleId);
      const rows = db.prepare("SELECT *,published_at position_time FROM article_comments WHERE article_id=? AND state='approved' AND (? IS NULL OR published_at<? OR (published_at=? AND id<?)) ORDER BY published_at DESC,id DESC LIMIT 21")
        .all(articleId, ...positionArgs(after)) as unknown as (CommentRow & { position_time: string })[];
      return { comments: rows.slice(0, 20).map(row => this.commentPublic(db, row)), cursor: pageCursor(rows) };
    });
  }
  engagement(token: string, articleId: string): Engagement {
    return this.own(token, (db, user) => {
      const article = readableArticle(db, articleId);
      const state = (table: string) => { const row = read<RelationRow>(db, `SELECT active,version FROM ${table} WHERE user_id=? AND article_id=?`, user, articleId); return { active: Boolean(row?.active), version: row?.version ?? 0 }; };
      const own = db.prepare("SELECT * FROM article_comments WHERE article_id=? AND user_id=? AND state!='deleted' ORDER BY created_at DESC,id DESC LIMIT 20").all(articleId, user) as unknown as CommentRow[];
      return { articleId, counts: engagementCounts(db, articleId), like: state('article_likes'), collection: state('article_collections'),
        relationship: this.relationship(db, user, article.user_id), wallet: this.wallet(db, user), ownComments: own.map(row => this.commentOwn(db, row)),
        writesEnabled: this.writesEnabled, commentsEnabled: this.commentsEnabled };
    });
  }
  submitComment(token: string, articleId: string, input: CommentInput): OwnComment {
    const parsed = commentInputSchema.parse(input, { jitless: true });
    return this.own(token, (db, user) => {
      const operation = { kind: 'comment', articleId, ...parsed }, receipt = this.receipt<{ id: string }>(db, user, input.operationId, operation);
      // Return current state rather than storing a second durable copy of the text in the receipt.
      if (receipt) return this.commentOwn(db, this.comment(db, receipt.id)); this.write(true);
      readableArticle(db, articleId);
      const id = randomUUID();
      db.prepare("INSERT INTO article_comments(id,article_id,user_id,text,state,version,created_at) VALUES(?,?,?,?,'pending',1,?)").run(id, articleId, user, parsed.text, this.stamp());
      this.remember(db, user, input.operationId, operation, { id }, articleId, 'comment');
      return this.commentOwn(db, this.comment(db, id));
    });
  }
  deleteComment(token: string, id: string, input: { operationId: string; expectedVersion: number }) {
    return this.own(token, (db, user) => {
      const operation = { kind: 'delete-comment', id, ...input }, receipt = this.receipt<{ deleted: true }>(db, user, input.operationId, operation);
      if (receipt) return receipt;
      const row = this.comment(db, id); if (row.user_id !== user) throw invalid('forbidden_action', '只能删除自己的评论。', 403);
      if (row.version !== input.expectedVersion || row.state === 'deleted') throw publicationConflict();
      db.prepare("UPDATE article_comments SET state='deleted',text='',reason='',version=version+1 WHERE id=?").run(id);
      this.audit(db, id, 'commenter', 'delete', row.version + 1, '');
      return this.remember(db, user, input.operationId, operation, { deleted: true as const }, row.article_id);
    });
  }
  report(token: string, id: string, input: { operationId: string; reason: string }) {
    return this.own(token, (db, user) => {
      const operation = { kind: 'report', id, ...input }, receipt = this.receipt<{ reported: true }>(db, user, input.operationId, operation);
      if (receipt) return receipt; this.write(true);
      const row = this.comment(db, id); readableArticle(db, row.article_id);
      if (row.state !== 'approved') throw publicationMissing();
      db.prepare("INSERT INTO comment_reports(id,comment_id,user_id,reason,state,version,created_at) VALUES(?,?,?,?,'pending',1,?)")
        .run(randomUUID(), id, user, input.reason, this.stamp());
      return this.remember(db, user, input.operationId, operation, { reported: true as const }, row.article_id);
    });
  }
  collections(token: string, cursor?: string): CollectionPage {
    const after = position(cursor);
    return this.own(token, (db, user) => {
      const rows = db.prepare('SELECT article_id id,version,created_at position_time FROM article_collections WHERE user_id=? AND active=1 AND (? IS NULL OR created_at<? OR (created_at=? AND article_id<?)) ORDER BY created_at DESC,article_id DESC LIMIT 21')
        .all(user, ...positionArgs(after)) as { id: string; version: number; position_time: string }[];
      return { collections: rows.slice(0, 20).map(row => {
        let article: PublicArticleCard | null = null;
        try { article = this.card(db, readableArticle(db, row.id)); } catch (error) { if (!(error instanceof PublicationError) || error.status !== 404) throw error; }
        return { articleId: row.id, available: article !== null, article, version: row.version, collectedAt: row.position_time };
      }), cursor: pageCursor(rows) };
    });
  }
  relationships(token: string, kind: 'following' | 'followers' | 'mutuals', cursor?: string): RelationshipPage {
    const after = position(cursor);
    return this.own(token, (db, user) => {
      const rows = db.prepare(`SELECT p.public_id id,p.user_id,f.created_at position_time FROM public_authors p JOIN author_follows f
        ON f.active=1 AND ${kind === 'followers' ? 'f.follower_id=p.user_id AND f.followed_id=?' : 'f.follower_id=? AND f.followed_id=p.user_id'}
        WHERE p.user_id!=? AND (? IS NULL OR f.created_at<? OR (f.created_at=? AND p.public_id<?))
        ${kind === 'mutuals' ? 'AND EXISTS(SELECT 1 FROM author_follows r WHERE r.active=1 AND r.follower_id=p.user_id AND r.followed_id=?)' : ''}
        ORDER BY f.created_at DESC,p.public_id DESC LIMIT 21`).all(user, user, ...positionArgs(after), ...(kind === 'mutuals' ? [user] : [])) as { id: string; user_id: string; position_time: string }[];
      return { authors: rows.slice(0, 20).map(row => ({ ...this.profile(db, row.user_id), relationship: this.relationship(db, user, row.user_id) })), cursor: pageCursor(rows) };
    });
  }
  private audit(db: DatabaseSync, id: string, actor: string, action: string, version: number, reason: string) {
    db.prepare('INSERT INTO comment_audit(comment_id,actor,action,version,reason,created_at) VALUES(?,?,?,?,?,?)').run(id, actor, action, version, reason, this.stamp());
  }
  summary(token: string) {
    return this.own(token, (db, user) => {
      const author = this.profile(db, user);
      return { publicAuthorId: author.id, following: author.following, followers: author.followers,
        mutuals: count(db, `SELECT COUNT(*) n FROM author_follows a JOIN author_follows b ON b.follower_id=a.followed_id AND b.followed_id=a.follower_id
          WHERE a.follower_id=? AND a.active=1 AND b.active=1`, user) };
    });
  }
  private adminComment(db: DatabaseSync, id: string): AdminComment {
    const row = this.comment(db, id);
    let articleTitle = '文章已失效', articleAvailable = false;
    try { articleTitle = this.content(db, readableArticle(db, row.article_id)).title; articleAvailable = true; } catch (error) { if (!(error instanceof PublicationError) || error.status !== 404) throw error; }
    return { ...this.commentOwn(db, row), articleTitle, articleAvailable, reports: count(db, "SELECT COUNT(*) n FROM comment_reports WHERE comment_id=? AND state='pending'", id) };
  }
  adminComments(state: OwnComment['state'], cursor?: string): AdminCommentPage {
    const after = position(cursor);
    return this.identity.publicationTransaction(db => {
      const rows = db.prepare('SELECT id,created_at position_time FROM article_comments WHERE state=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21')
        .all(state, ...positionArgs(after)) as { id: string; position_time: string }[];
      return { comments: rows.slice(0, 20).map(row => this.adminComment(db, row.id)), cursor: pageCursor(rows) };
    });
  }
  adminDetail(id: string) { return this.identity.publicationTransaction(db => this.adminComment(db, id)); }
  adminReview(id: string, actor: () => string, input: CommentReview) {
    return this.identity.publicationTransaction(db => {
      const name = actor(), operation = { kind: 'review-comment', id, ...input }, receipt = this.receipt<{ id: string }>(db, 'admin:' + name, input.operationId, operation);
      if (receipt) return this.adminComment(db, receipt.id);
      const row = this.comment(db, id); if (row.version !== input.expectedVersion) throw publicationConflict();
      if (input.action === 'hide' ? row.state !== 'approved' : row.state !== 'pending') throw publicationConflict();
      if (input.action !== 'hide') readableArticle(db, row.article_id);
      if (input.action !== 'approve' && !input.reason) throw invalid('reason_required', '请填写处理原因。');
      const state = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'hidden';
      db.prepare('UPDATE article_comments SET state=?,version=version+1,reason=?,published_at=CASE WHEN ?=\'approved\' THEN ? ELSE published_at END WHERE id=?')
        .run(state, input.reason, state, this.stamp(), id);
      this.audit(db, id, name, input.action, row.version + 1, input.reason);
      this.remember(db, 'admin:' + name, input.operationId, operation, { id }, row.article_id);
      return this.adminComment(db, id);
    });
  }
  audits(id: string): CommentAudit[] {
    return this.identity.publicationTransaction(db => { this.comment(db, id); return db.prepare('SELECT id,action,actor,version,reason,created_at createdAt FROM comment_audit WHERE comment_id=? ORDER BY id DESC LIMIT 100').all(id) as unknown as CommentAudit[]; });
  }
  private reportOf(db: DatabaseSync, id: string): AdminCommentReport {
    const row = read<AdminCommentReport>(db, 'SELECT id,comment_id commentId,reason,state,version,created_at createdAt,resolution FROM comment_reports WHERE id=?', id);
    if (!row) throw publicationMissing(); return row;
  }
  adminReports(state: 'pending' | 'resolved', cursor?: string): AdminReportPage {
    const after = position(cursor);
    return this.identity.publicationTransaction(db => {
      const rows = db.prepare('SELECT id,created_at position_time FROM comment_reports WHERE state=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21')
        .all(state, ...positionArgs(after)) as { id: string; position_time: string }[];
      return { reports: rows.slice(0, 20).map(row => this.reportOf(db, row.id)), cursor: pageCursor(rows) };
    });
  }
  resolveReport(id: string, actor: () => string, input: { operationId: string; expectedVersion: number; reason: string }) {
    return this.identity.publicationTransaction(db => {
      const name = actor(), operation = { kind: 'resolve-report', id, ...input }, receipt = this.receipt<{ id: string }>(db, 'admin:' + name, input.operationId, operation);
      if (receipt) return this.reportOf(db, receipt.id);
      const report = this.reportOf(db, id); if (report.version !== input.expectedVersion || report.state !== 'pending') throw publicationConflict();
      db.prepare("UPDATE comment_reports SET state='resolved',version=version+1,resolution=? WHERE id=?").run(input.reason, id);
      this.audit(db, report.commentId, name, 'report-resolved', report.version + 1, input.reason);
      this.remember(db, 'admin:' + name, input.operationId, operation, { id }, this.comment(db, report.commentId).article_id);
      return this.reportOf(db, id);
    });
  }
  event(input: SocialEventInput, token?: string) {
    return this.access(token, (db, user) => {
      if ((input.event === 'login_success' || input.event === 'return_visit') && !user) throw invalid('login_required', '请先登录。', 401);
      readableArticle(db, input.articleId);
      this.cleanupOf(db);
      const first = read<{ created_at: number }>(db, 'SELECT MIN(created_at) created_at FROM social_events WHERE session_id=?', input.sessionId);
      if (first?.created_at && first.created_at < this.now() - 30 * 60_000) throw invalid('event_session_expired', '统计会话已结束。');
      const inserted = db.prepare('INSERT OR IGNORE INTO social_events(id,session_id,article_id,event,action,created_at) VALUES(?,?,?,?,?,?)')
        .run(input.eventId, input.sessionId, input.articleId, input.event, input.action, this.now());
      if (inserted.changes) this.metric(db, input.event, input.action);
      return { recorded: true };
    });
  }
  private cleanupOf(db: DatabaseSync) {
    db.prepare('DELETE FROM social_events WHERE created_at<?').run(this.now() - 7 * 86400_000);
    db.prepare('DELETE FROM social_daily_metrics WHERE day<?').run(new Date(this.now() - 90 * 86400_000).toISOString().slice(0, 10));
  }
  cleanup() { this.identity.publicationTransaction(db => this.cleanupOf(db)); }
  metrics() { return this.identity.publicationTransaction(db => { this.cleanupOf(db); return { days: db.prepare('SELECT day,event,action,count FROM social_daily_metrics ORDER BY day DESC,event,action LIMIT 5400').all() }; }); }
}
