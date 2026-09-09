// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { PublicationStore } from '../server/publication-store';
import { SocialStore } from '../server/social-store';
import { CloudWorkStore } from '../server/cloud-work-store';
import { AccountStore } from '../server/account-store';
import { createGateway } from '../server/gateway';
import { WechatAuthService } from '../server/wechat-auth';
import { TopicStore } from '../server/topic-store';
import { TopicAdminAuthService, createTopicAdminPasswordHash } from '../server/topic-admin-auth';
import { loadSocialRuntime } from '../server/social-runtime';
import { emptyDraft, workFromDraft, newSession, emptyWritingState } from '../packages/core/src/index';
import type { SocialMutation } from '../packages/core/src/social-protocol';

const resources: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of resources.splice(0).reverse()) await cleanup(); });
const op = () => randomUUID();
const state = (active = true, expectedVersion = 0): SocialMutation => ({ operationId: op(), active, expectedVersion });
const consent = (audience: 'guest' | 'account', expectedVersion: number) => ({ operationId: op(), audience, expectedVersion, consentVersion: 'guest-reading-v1' as const });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'social-')), path = join(dir, 'auth.sqlite');
  let time = Date.parse('2026-09-09T15:59:00Z');
  const identity = new MiniIdentityStore({ path, now: () => time });
  resources.push(async () => { identity.close(); await rm(dir, { recursive: true, force: true }); });
  const a = identity.issueSession('test-app', 'author', 'account'), b = identity.issueSession('test-app', 'reader', 'account'), c = identity.issueSession('test-app', 'other', 'account');
  const publications = new PublicationStore(identity, () => time), social = new SocialStore(identity, { now: () => time }), cloud = new CloudWorkStore(identity, undefined, () => time);
  const draft = { ...emptyDraft(), title: '已审文章', inputMode: 'text' as const, textDraft: '公开文字与私有输入边界', pendingVoice: '不公开语音' };
  const snapshot = { work: workFromDraft(draft), session: newSession(draft), writingState: { ...emptyWritingState(), composer: '不公开输入' } };
  cloud.mutate(a.token, { operationId: op(), workId: draft.id, kind: 'create', baseVersion: 0, snapshot });
  const bytes = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#779988' } }).jpeg().toBuffer();
  const image = await publications.upload(a.token, draft.id, op(), bytes);
  await publications.settings(a.token, draft.id, { operationId: op(), assetId: image.assetId, crops: image.crops, expectedVersion: 0 });
  const preview = publications.preview(a.token, draft.id), articleId = preview.articleId;
  const submission = publications.submit(a.token, draft.id, { operationId: op(), workVersion: preview.workVersion, settingsVersion: preview.settingsVersion, expectedVersion: preview.version, authorName: preview.authorName });
  publications.adminAction(articleId, () => 'reviewer', { operationId: op(), expectedVersion: submission.version, submissionId: submission.submissionId, action: 'approve', reason: '' });
  const authorId = publications.publicArticle(b.token, articleId).publicAuthorId!;
  const publicId = (user: string) => identity.publicationTransaction(db => String(db.prepare('SELECT public_id FROM public_authors WHERE user_id=?').get(user)!.public_id));
  return { identity, social, publications, cloud, a, b, c, path, draft, snapshot, articleId, authorId, publicId,
    advance: (ms: number) => { time += ms; }, now: () => time,
    open: () => social.audience(a.token, draft.id, consent('guest', publications.status(a.token, draft.id).audienceVersion!)),
    withdraw: () => publications.withdraw(a.token, draft.id, { operationId: op(), expectedVersion: publications.status(a.token, draft.id).version, action: 'withdraw', reason: '' }) };
}

describe('读者社交真实 SQLite 事务', () => {
  it('真实schema3迁移保留身份作品已审版本，迁移中途失败不留下部分表，已发表旧文章直接可读', async () => {
    const s = await setup(); s.identity.close();
    const tables = ['social_daily_metrics', 'social_events', 'social_operations', 'flower_ledger', 'flower_accounts', 'comment_audit',
      'comment_reports', 'article_comments', 'author_follows', 'article_collections', 'article_likes', 'publication_audience_consents', 'public_authors'];
    const old = new DatabaseSync(s.path);
    for (const table of tables) old.exec('DROP TABLE ' + table);
    old.exec('DROP INDEX author_articles_recent; ALTER TABLE publication_articles DROP COLUMN audience; ALTER TABLE publication_articles DROP COLUMN audience_version; PRAGMA user_version=3;');
    const snapshot = old.prepare('SELECT snapshot FROM cloud_works').get()!.snapshot;
    old.exec('CREATE TABLE social_operations(collision TEXT);'); old.close();
    expect(() => new MiniIdentityStore({ path: s.path, now: s.now })).toThrow();
    const failed = new DatabaseSync(s.path);
    expect(failed.prepare('PRAGMA user_version').get()!.user_version).toBe(3);
    expect(failed.prepare('PRAGMA table_info(publication_articles)').all().map(row => row.name)).not.toContain('audience');
    expect(failed.prepare("SELECT name FROM sqlite_master WHERE name='public_authors'").get()).toBeUndefined();
    failed.exec('DROP TABLE social_operations'); failed.close();
    const migrated = new MiniIdentityStore({ path: s.path, now: s.now });
    try {
      expect(migrated.statistics().schemaVersion).toBe(4);
      expect(migrated.authenticate(s.a.token, true).userId).toBe(s.a.userId);
      expect(new PublicationStore(migrated).publicArticle(s.b.token, s.articleId).body).toContain('公开文字');
      expect(new SocialStore(migrated).article(s.articleId).id).toBe(s.articleId);
      migrated.publicationTransaction(db => {
        expect(db.prepare('SELECT snapshot FROM cloud_works').get()!.snapshot).toBe(snapshot);
        expect(db.prepare('SELECT COUNT(*) n FROM public_authors').get()!.n).toBe(3);
        expect(db.prepare('SELECT COUNT(*) n FROM flower_ledger').get()!.n).toBe(0);
        expect(db.prepare('SELECT audience,audience_version FROM publication_articles').get()).toMatchObject({ audience: 'account', audience_version: 0 });
      });
    } finally { migrated.close(); }
  });
  it('已发表旧文章直接支持游客，兼容受众不限制阅读，撤回切断公开内容', async () => {
    const s = await setup(); expect(s.identity.statistics().schemaVersion).toBe(4);
    expect(s.publications.status(s.a.token, s.draft.id)).toMatchObject({ audience: 'account', audienceVersion: 0 });
    expect(s.social.article(s.articleId).id).toBe(s.articleId); expect(s.social.image(s.articleId, 'reading').byteLength).toBeGreaterThan(100);
    expect(s.publications.publicArticle(s.b.token, s.articleId).body).toContain('公开文字');
    const approved = s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text: '可读评论' });
    s.social.adminReview(approved.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' });
    const value = s.social.article(s.articleId);
    expect(value).toMatchObject({ publicAuthorId: s.authorId, audienceVersion: 0, counts: { comments: 1, likes: 0, flowers: 0 } });
    expect(Object.keys(value).sort()).toEqual(['aiAssisted', 'audienceVersion', 'authorName', 'body', 'counts', 'id', 'publicAuthorId', 'publishedAt', 'title', 'version'].sort());
    expect(JSON.stringify(value)).not.toContain(s.a.userId); expect(JSON.stringify(value)).not.toContain('不公开');
    expect(s.social.image(s.articleId, 'thumbnail').byteLength).toBeGreaterThan(100);
    expect(s.social.comments(s.articleId).comments).toHaveLength(1);
    s.social.audience(s.a.token, s.draft.id, consent('account', 0));
    expect(s.social.article(s.articleId).id).toBe(s.articleId);
    expect(s.social.author(s.authorId).articles).toBe(1);
    expect(s.social.authorArticles(s.authorId).articles).toHaveLength(1);
    s.withdraw();
    expect(() => s.social.article(s.articleId)).toThrow(); expect(() => s.social.image(s.articleId, 'thumbnail')).toThrow(); expect(() => s.social.comments(s.articleId)).toThrow();
    expect(s.social.authorArticles(s.authorId).articles).toHaveLength(0); expect(s.social.authorArticles(s.authorId, s.b.token).articles).toHaveLength(0);
  });
  it('时间游标稳定分页：评论收藏关系花记录作者文章及审核举报队列按时间倒序，新插入不重复旧页', async () => {
    const s = await setup(); s.open();
    for (let day = 0; day < 8; day++) { s.social.claim(s.b.token); s.advance(86400_000); }
    const comments: string[] = [], articles: string[] = [], followers: string[] = [];
    for (let i = 0; i < 23; i++) {
      s.advance(1000);
      const comment = s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text: '时间排序评论' + i });
      s.social.adminReview(comment.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' });
      s.social.report(s.c.token, comment.id, { operationId: op(), reason: '时间排序举报' + i }); comments.push(comment.id);
      s.social.gift(s.b.token, s.articleId, { operationId: op(), gift: 'flower' });
      const follower = s.identity.issueSession('test-app', 'ordered-follower-' + i, 'account');
      s.social.follow(follower.token, s.authorId, state()); followers.push(s.publicId(follower.userId));
      const articleId = op(), workId = op(), submissionId = op(), timestamp = new Date(s.now()).toISOString();
      // Duplicate approved fixture snapshots only; no production account or externally sourced text is used.
      s.identity.publicationTransaction(db => {
        db.prepare(`INSERT INTO cloud_works(user_id,id,version,sequence,title,updated_at,deleted_at,purged,snapshot,bytes)
          SELECT user_id,?,version,sequence,title,updated_at,deleted_at,purged,snapshot,bytes FROM cloud_works WHERE user_id=? AND id=?`).run(workId, s.a.userId, s.draft.id);
        db.prepare(`INSERT INTO publication_articles(id,user_id,work_id,version,settings_version,asset_id,published_id,first_published_at,audience,audience_version)
          SELECT ?,user_id,?,version,settings_version,asset_id,?,?,audience,audience_version FROM publication_articles WHERE id=?`).run(articleId, workId, submissionId, timestamp, s.articleId);
        db.prepare(`INSERT INTO publication_submissions(id,article_id,asset_id,content,bytes,work_version,settings_version,state,created_at,reviewed_at)
          SELECT ?,?,asset_id,content,bytes,work_version,settings_version,state,?,? FROM publication_submissions WHERE id=(SELECT published_id FROM publication_articles WHERE id=?)`)
          .run(submissionId, articleId, timestamp, timestamp, s.articleId);
      });
      s.social.reaction(s.b.token, articleId, 'collection', state()); articles.push(articleId);
    }
    const commentFirst = s.social.comments(s.articleId), collectionFirst = s.social.collections(s.b.token), relationshipFirst = s.social.relationships(s.a.token, 'followers');
    const historyFirst = s.social.flowerHistory(s.b.token), authorFirst = s.social.authorArticles(s.authorId), adminFirst = s.social.adminComments('approved'), reportsFirst = s.social.adminReports('pending');
    expect(commentFirst.comments.map(row => row.id)).toEqual(comments.slice().reverse().slice(0, 20));
    expect(collectionFirst.collections.map(row => row.articleId)).toEqual(articles.slice().reverse().slice(0, 20));
    expect(relationshipFirst.authors.map(row => row.id)).toEqual(followers.slice().reverse().slice(0, 20));
    expect(authorFirst.articles.map(row => row.id)).toEqual(articles.slice().reverse().slice(0, 20));
    expect(adminFirst.comments.map(row => row.id)).toEqual(comments.slice().reverse().slice(0, 20));
    expect(reportsFirst.reports.map(row => row.commentId)).toEqual(comments.slice().reverse().slice(0, 20));
    expect(historyFirst.entries.map(row => row.createdAt)).toEqual(historyFirst.entries.map(row => row.createdAt).sort().reverse());
    s.advance(1000); const newest = s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text: '翻页期间新评论' });
    s.social.adminReview(newest.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' });
    s.social.report(s.c.token, newest.id, { operationId: op(), reason: '新举报' });
    s.social.reaction(s.b.token, s.articleId, 'collection', state()); s.social.gift(s.b.token, s.articleId, { operationId: op(), gift: 'flower' });
    const latestFollower = s.identity.issueSession('test-app', 'latest-follower', 'account'); s.social.follow(latestFollower.token, s.authorId, state());
    const tail = s.social.comments(s.articleId, undefined, commentFirst.cursor!);
    expect(tail.comments.map(row => row.id)).toEqual(comments.slice(0, 3).reverse()); expect(tail.cursor).toBeNull();
    expect(s.social.collections(s.b.token, collectionFirst.cursor!).collections.map(row => row.articleId)).toEqual(articles.slice(0, 3).reverse());
    expect(s.social.relationships(s.a.token, 'followers', relationshipFirst.cursor!).authors.map(row => row.id)).toEqual(followers.slice(0, 3).reverse());
    expect(s.social.flowerHistory(s.b.token, historyFirst.cursor!).entries).toHaveLength(3);
    expect(s.social.authorArticles(s.authorId, undefined, authorFirst.cursor!).articles).toHaveLength(4);
    expect(s.social.adminComments('approved', adminFirst.cursor!).comments.map(row => row.id)).toEqual(comments.slice(0, 3).reverse());
    expect(s.social.adminReports('pending', reportsFirst.cursor!).reports.map(row => row.commentId)).toEqual(comments.slice(0, 3).reverse());
    expect(() => s.social.comments(s.articleId, undefined, 'invalid')).toThrow();
  });
  it('同意操作有版本与摘要，旧投稿输入不覆盖选择，公开作者改名不改变标识', async () => {
    const s = await setup(); const input = consent('guest', 0);
    expect(s.social.audience(s.a.token, s.draft.id, input)).toEqual(s.social.audience(s.a.token, s.draft.id, input));
    expect(() => s.social.audience(s.a.token, s.draft.id, { ...input, audience: 'account' })).toThrow();
    expect(() => s.social.audience(s.b.token, s.draft.id, consent('guest', 1))).toThrow();
    expect(() => s.social.audience(s.a.token, s.draft.id, consent('account', 0))).toThrow();
    const preview = s.publications.preview(s.a.token, s.draft.id);
    s.publications.submit(s.a.token, s.draft.id, { operationId: op(), workVersion: preview.workVersion, settingsVersion: preview.settingsVersion, expectedVersion: preview.version, authorName: preview.authorName });
    expect(s.publications.status(s.a.token, s.draft.id).audience).toBe('guest');
    new AccountStore(s.identity).updateNickname(s.a.token, '新的作者名');
    expect(s.social.author(s.authorId)).toMatchObject({ id: s.authorId, name: '新的作者名', avatar: 'default' });
    expect(s.social.article(s.articleId).authorName).toBe(preview.authorName);
  });
  it('点赞收藏唯一、相同操作幂等、旧版本不能逆转选择，失效收藏只有占位且可移除', async () => {
    const s = await setup(), like = state();
    expect(s.social.reaction(s.b.token, s.articleId, 'like', like)).toEqual(s.social.reaction(s.b.token, s.articleId, 'like', like));
    expect(s.social.reaction(s.b.token, s.articleId, 'like', state(false, 1))).toMatchObject({ active: false, version: 2, counts: { likes: 0 } });
    expect(() => s.social.reaction(s.b.token, s.articleId, 'like', state(true, 1))).toThrow();
    expect(() => s.social.reaction(s.b.token, s.articleId, 'like', { ...like, active: false })).toThrow();
    s.social.reaction(s.b.token, s.articleId, 'collection', state());
    expect(s.social.collections(s.c.token).collections).toEqual([]);
    s.withdraw(); expect(s.social.collections(s.b.token).collections[0]).toMatchObject({ available: false, article: null, version: 1 });
    s.social.reaction(s.b.token, s.articleId, 'collection', state(false, 1));
    expect(s.social.collections(s.b.token).collections).toEqual([]);
    expect(() => s.social.reaction(s.b.token, s.articleId, 'like', state(true, 2))).toThrow();
  });
  it('两个独立方向推导互关，取消只改本人方向，私有列表分页且不能自关注', async () => {
    const s = await setup(), readerId = s.publicId(s.b.userId);
    expect(() => s.social.follow(s.a.token, s.authorId, state())).toThrow();
    const input = state(); expect(s.social.follow(s.b.token, s.authorId, input)).toMatchObject({ active: true, mutual: false });
    expect(s.social.follow(s.b.token, s.authorId, input)).toMatchObject({ version: 1 });
    expect(s.social.follow(s.a.token, readerId, state())).toMatchObject({ mutual: true });
    expect(s.social.relationships(s.b.token, 'mutuals').authors).toHaveLength(1);
    s.social.follow(s.b.token, s.authorId, state(false, 1));
    expect(s.social.relationships(s.b.token, 'mutuals').authors).toHaveLength(0);
    expect(s.social.relationships(s.b.token, 'followers').authors).toHaveLength(1);
    expect(s.social.relationships(s.a.token, 'following').authors).toHaveLength(1);
    expect(() => s.social.follow(s.b.token, s.authorId, state(true, 1))).toThrow();
    for (let i = 0; i < 22; i++) { const follower = s.identity.issueSession('test-app', 'follower-' + i, 'account'); s.social.follow(follower.token, s.authorId, state()); }
    const first = s.social.relationships(s.a.token, 'followers'); expect(first.authors).toHaveLength(20); expect(first.cursor).not.toBeNull();
    const second = s.social.relationships(s.a.token, 'followers', first.cursor!); expect(second.authors).toHaveLength(2);
    expect(new Set([...first.authors, ...second.authors].map(row => row.id)).size).toBe(22);
  });
  it('评论Unicode边界和纯文字，待审仅本人可见，审核并发、自删和失效优先', async () => {
    const s = await setup(); s.open();
    for (const text of ['', '   ', '🌷'.repeat(301)]) expect(() => s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text })).toThrow();
    const input = { operationId: op(), text: '  <b>🌷'.repeat(1) + '</b>  ' };
    const comment = s.social.submitComment(s.b.token, s.articleId, input);
    expect(s.social.submitComment(s.b.token, s.articleId, input).id).toBe(comment.id);
    expect(s.social.comments(s.articleId).comments).toEqual([]);
    expect(s.social.engagement(s.a.token, s.articleId).ownComments).toEqual([]);
    expect(s.social.engagement(s.b.token, s.articleId).ownComments[0]).toMatchObject({ state: 'pending', text: '<b>🌷</b>' });
    const approved = s.social.adminReview(comment.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' });
    expect(approved.state).toBe('approved'); expect(s.social.comments(s.articleId).comments[0]!.text).toBe('<b>🌷</b>');
    expect(() => s.social.deleteComment(s.a.token, comment.id, { operationId: op(), expectedVersion: 2 })).toThrow();
    s.social.deleteComment(s.b.token, comment.id, { operationId: op(), expectedVersion: 2 });
    expect(s.social.comments(s.articleId).comments).toEqual([]);
    expect(() => s.social.adminReview(comment.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' })).toThrow();
    const pending = s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text: '🌷'.repeat(300) }); s.withdraw();
    expect(() => s.social.adminReview(pending.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' })).toThrow();
  });
  it('举报审核独立，有必要审计，隐藏不自动处理举报、处理不复活评论', async () => {
    const s = await setup(), comment = s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text: '待审核内容' });
    expect(() => s.social.report(s.c.token, comment.id, { operationId: op(), reason: '不合适' })).toThrow();
    s.social.adminReview(comment.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' });
    const report = { operationId: op(), reason: '不合适' }; s.social.report(s.c.token, comment.id, report); s.social.report(s.c.token, comment.id, report);
    expect(s.social.adminReports('pending').reports).toHaveLength(1);
    s.social.adminReview(comment.id, () => 'reviewer', { operationId: op(), expectedVersion: 2, action: 'hide', reason: '隐藏原因' });
    expect(s.social.comments(s.articleId, s.a.token).comments).toEqual([]);
    const row = s.social.adminReports('pending').reports[0]!;
    s.social.resolveReport(row.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, reason: '已复核并隐藏' });
    expect(s.social.adminReports('pending').reports).toEqual([]);
    expect(s.social.audits(comment.id).map(row => row.action)).toEqual(['report-resolved', 'hide', 'approve']);
    expect(s.social.adminDetail(comment.id).state).toBe('hidden');
  });
  it('每日按北京时间发3朵并累计、重复及并发领取仅一次，会话替换不能到账', async () => {
    const s = await setup(); expect(s.social.flowers(s.b.token)).toMatchObject({ balance: 0, claimedToday: false, today: '2026-09-09' });
    const values = await Promise.all(Array.from({ length: 10 }, async () => s.social.claim(s.b.token)));
    expect(values.every(row => row.balance === 3)).toBe(true);
    s.advance(60_000); expect(s.social.claim(s.b.token)).toMatchObject({ balance: 6, today: '2026-09-10' });
    const newSession = s.identity.issueSession('test-app', 'reader', 'account');
    expect(() => s.social.claim(s.b.token)).toThrow('session_replaced');
    expect(s.social.claim(newSession.token).balance).toBe(6);
  });
  it('送花条件扣余额与账本原子，回执在撤下后可核对，送达不增加作者可送余额', async () => {
    const s = await setup(); s.social.claim(s.b.token);
    for (let i = 0; i < 2; i++) s.social.gift(s.b.token, s.articleId, { operationId: op(), gift: 'flower' });
    const input = { operationId: op(), gift: 'flower' as const };
    const results = await Promise.allSettled([Promise.resolve().then(() => s.social.gift(s.b.token, s.articleId, input)), Promise.resolve().then(() => s.social.gift(s.b.token, s.articleId, { operationId: op(), gift: 'flower' }))]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(s.social.flowers(s.b.token).balance).toBe(0); expect(s.social.flowers(s.a.token).balance).toBe(0);
    const receipt = s.social.gift(s.b.token, s.articleId, input); expect(receipt.flowers).toBe(3);
    s.withdraw(); expect(s.social.gift(s.b.token, s.articleId, input)).toEqual(receipt);
    expect(() => s.social.gift(s.b.token, s.articleId, { operationId: op(), gift: 'flower' })).toThrow();
    expect(s.social.flowerHistory(s.b.token).entries).toHaveLength(3);
    expect(() => s.social.gift(s.b.token, s.articleId, { ...input, gift: 'pen' as 'flower' })).toThrow();
  });
  it('送花数据库中途失败整体回滚，原操作可安全重试、自赠拒绝', async () => {
    const s = await setup(); s.social.claim(s.b.token); s.social.claim(s.a.token);
    expect(() => s.social.gift(s.a.token, s.articleId, { operationId: op(), gift: 'flower' })).toThrow();
    const db = new DatabaseSync(s.path), input = { operationId: op(), gift: 'flower' as const };
    try {
      db.exec("CREATE TRIGGER fail_gift BEFORE INSERT ON flower_ledger WHEN NEW.kind='gift_sent' BEGIN SELECT RAISE(ABORT,'injected disk failure'); END");
      expect(() => s.social.gift(s.b.token, s.articleId, input)).toThrow('injected disk failure');
      expect(s.social.flowers(s.b.token).balance).toBe(3);
      expect(db.prepare('SELECT COUNT(*) n FROM social_operations WHERE id=?').get(input.operationId)!.n).toBe(0);
      db.exec('DROP TRIGGER fail_gift'); expect(s.social.gift(s.b.token, s.articleId, input).balance).toBe(2);
    } finally { db.close(); }
  });
  it('永久删除清除评论正文与审核举报说明，账本回执保留，私有删除失败整体回滚', async () => {
    const s = await setup(); const comment = s.social.submitComment(s.b.token, s.articleId, { operationId: op(), text: '需要清除的评论' });
    s.social.adminReview(comment.id, () => 'reviewer', { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' });
    s.social.report(s.c.token, comment.id, { operationId: op(), reason: '举报包含评论' });
    s.social.claim(s.b.token); const gift = { operationId: op(), gift: 'flower' as const }; const receipt = s.social.gift(s.b.token, s.articleId, gift);
    const db = new DatabaseSync(s.path);
    try {
      s.cloud.mutate(s.a.token, { operationId: op(), workId: s.draft.id, kind: 'trash', baseVersion: 1 });
      db.exec("CREATE TRIGGER fail_purge BEFORE UPDATE ON cloud_works BEGIN SELECT RAISE(ABORT,'purge failure'); END");
      const purge = { operationId: op(), workId: s.draft.id, kind: 'purge' as const, baseVersion: 2 };
      expect(() => s.cloud.mutate(s.a.token, purge)).toThrow('purge failure');
      expect(db.prepare('SELECT text FROM article_comments WHERE id=?').get(comment.id)!.text).toBe('需要清除的评论');
      db.exec('DROP TRIGGER fail_purge'); s.cloud.mutate(s.a.token, purge);
      expect(db.prepare('SELECT text,state FROM article_comments WHERE id=?').get(comment.id)).toMatchObject({ text: '', state: 'deleted' });
      expect(db.prepare('SELECT reason FROM comment_reports WHERE comment_id=?').get(comment.id)!.reason).toBe('');
      expect(s.social.gift(s.b.token, s.articleId, gift)).toEqual(receipt);
      expect(JSON.stringify(db.prepare('SELECT * FROM social_operations').all())).not.toContain('需要清除的评论');
    } finally { db.close(); }
  });
  it('功能开关关闭新写入仍保留旧阅读和已提交回执，评论关闭不影响花或收藏', async () => {
    const s = await setup(); s.open(); const like = state(); const first = s.social.reaction(s.b.token, s.articleId, 'like', like);
    const closed = new SocialStore(s.identity, { writesEnabled: false, guestOpeningEnabled: false, now: s.now });
    expect(closed.article(s.articleId).id).toBe(s.articleId);
    expect(closed.reaction(s.b.token, s.articleId, 'like', like)).toEqual(first);
    expect(() => closed.reaction(s.b.token, s.articleId, 'like', state(false, 1))).toThrow();
    expect(() => closed.audience(s.a.token, s.draft.id, consent('guest', 1))).toThrow();
    closed.audience(s.a.token, s.draft.id, consent('account', 1));
    const noComments = new SocialStore(s.identity, { commentsEnabled: false, now: s.now });
    expect(() => noComments.submitComment(s.b.token, s.articleId, { operationId: op(), text: '暂停' })).toThrow();
    expect(noComments.claim(s.b.token).balance).toBe(3);
    expect(loadSocialRuntime({ SOCIAL_WRITES_ENABLED: 'false', SOCIAL_GUEST_OPENING_ENABLED: 'invalid' })).toMatchObject({ writesEnabled: false, guestOpeningEnabled: false, commentsEnabled: true });
  });
  it('最小统计按事件去重，原始7天删除、日汇总90天删除、匿名联结30分钟且不收正文', async () => {
    const s = await setup(); s.open();
    const event = { eventId: op(), sessionId: op(), articleId: s.articleId, event: 'share_entry_open' as const, action: 'read' as const };
    s.social.event(event); s.social.event(event);
    expect(s.social.metrics().days).toContainEqual({ day: '2026-09-09', event: 'share_entry_open', action: 'read', count: 1 });
    expect(() => s.social.event({ ...event, eventId: op(), event: 'login_success' })).toThrow();
    s.advance(31 * 60_000); expect(() => s.social.event({ ...event, eventId: op() })).toThrow();
    s.advance(8 * 86400_000); s.social.cleanup();
    s.identity.publicationTransaction(db => expect(db.prepare('SELECT COUNT(*) n FROM social_events').get()!.n).toBe(0));
    expect(s.social.metrics().days).toHaveLength(1);
    s.advance(90 * 86400_000); expect(s.social.metrics().days).toEqual([]);
  });
});

async function httpSetup() {
  const s = await setup(), topics = new TopicStore({ path: ':memory:' });
  const password = 'isolated-social-review-password', origin = 'https://admin.test';
  const auth = new TopicAdminAuthService(topics, { username: 'reviewer', passwordHash: createTopicAdminPasswordHash(password), secureCookie: false, sessionDurationMs: 3600_000 });
  const service = new WechatAuthService({ appId: 'test-app' }, s.identity, { exchange: async code => ({ appId: 'test-app', openid: code }) });
  const logs: unknown[] = [];
  const app = await createGateway({ origin, miniAuth: { service }, topics, topicAdmin: { auth }, social: { now: s.now }, operations: row => logs.push(row) });
  resources.push(async () => { await app.close(); topics.close(); });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const login = await app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { origin }, payload: { username: 'reviewer', password } });
  const admin = { origin, cookie: login.cookies.map(c => c.name + '=' + c.value).join('; '), 'x-csrf-token': login.json().csrfToken as string };
  return { ...s, app, address, admin, logs, headers: { authorization: 'Bearer ' + s.b.token } };
}
describe('读者社交隔离真实 HTTP 与权限', () => {
  it('匿名事件单独限流，不占阅读桶且没有评论审核后台时拒绝新评论', async () => {
    const s = await httpSetup(); s.open();
    const payload = { eventId: op(), sessionId: op(), articleId: s.articleId, event: 'share_entry_open', action: 'read' };
    for (let i = 0; i < 30; i++) expect((await s.app.inject({ method: 'POST', url: '/api/public/social/events', payload })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: '/api/public/social/events', payload })).statusCode).toBe(429);
    expect((await s.app.inject({ url: '/api/public/articles/' + s.articleId })).statusCode).toBe(200);
    expect(s.social.metrics().days).toContainEqual({ day: '2026-09-09', event: 'share_entry_open', action: 'read', count: 1 });
    const service = new WechatAuthService({ appId: 'test-app' }, s.identity, { exchange: async code => ({ appId: 'test-app', openid: code }) });
    const unconfigured = await createGateway({ origin: 'https://admin.test', miniAuth: { service }, operations: () => undefined });
    try {
      const response = await unconfigured.inject({ method: 'POST', url: '/api/mini/articles/' + s.articleId + '/comments', headers: s.headers, payload: { operationId: op(), text: '尚无审核后台' } });
      expect(response.statusCode).toBe(503); expect(response.json().code).toBe('social_disabled');
      expect((await unconfigured.inject({ url: '/api/mini/articles/' + s.articleId + '/engagement', headers: s.headers })).json().commentsEnabled).toBe(false);
    } finally { await unconfigured.close(); }
  });
  it('匿名白名单与普通账号/后台CSRF分开，禁止任意字段、私有列表参数和不支持礼物', async () => {
    const s = await httpSetup();
    expect((await fetch(s.address + '/api/public/articles/' + s.articleId)).status).toBe(200); s.open();
    const article = await fetch(s.address + '/api/public/articles/' + s.articleId); expect(article.status).toBe(200); expect(article.headers.get('cache-control')).toBe('no-store');
    expect((await fetch(s.address + '/api/public/articles/' + s.articleId, { headers: s.headers })).status).toBe(400);
    for (const route of ['me/collections', 'me/following', 'me/flowers', `articles/${s.articleId}/engagement`]) expect((await fetch(s.address + '/api/mini/' + route)).status).toBe(401);
    expect((await s.app.inject({ url: '/api/mini/me/collections?userId=' + s.a.userId, headers: s.headers })).statusCode).toBe(400);
    expect((await s.app.inject({ url: '/api/public/authors/' + s.authorId + '/followers' })).statusCode).toBe(404);
    expect((await s.app.inject({ url: '/api/public/articles/' + s.articleId + '/images/master' })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'POST', url: '/api/mini/articles/' + s.articleId + '/gifts', headers: s.headers, payload: { operationId: op(), gift: 'pen' } })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'POST', url: '/api/mini/articles/' + s.articleId + '/comments', headers: s.headers, payload: { operationId: op(), text: '有效', parentId: op() } })).statusCode).toBe(400);
    const posted = await s.app.inject({ method: 'POST', url: '/api/mini/articles/' + s.articleId + '/comments', headers: s.headers, payload: { operationId: op(), text: 'HTTP真实待审评论' } });
    expect(posted.statusCode).toBe(200);
    const target = '/api/admin/comments/' + posted.json().id + '/actions', payload = { operationId: op(), expectedVersion: 1, action: 'approve', reason: '' };
    expect((await s.app.inject({ method: 'POST', url: target, headers: s.headers, payload })).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url: target, headers: { ...s.admin, 'x-csrf-token': 'invalid' }, payload })).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url: target, headers: s.admin, payload })).statusCode).toBe(200);
    expect((await fetch(s.address + '/api/public/articles/' + s.articleId + '/comments')).status).toBe(200);
    expect(JSON.stringify(s.logs)).not.toContain('HTTP真实待审评论'); expect(JSON.stringify(s.logs)).not.toContain(s.b.token);
  });
  it('社交类别写限流有界，失效会话不可作为匿名身份写入', async () => {
    const s = await httpSetup();
    for (let i = 0; i < 6; i++) expect((await s.app.inject({ method: 'POST', url: '/api/mini/articles/' + s.articleId + '/comments', headers: s.headers, payload: { operationId: op(), text: '第' + i + '条' } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: '/api/mini/articles/' + s.articleId + '/comments', headers: s.headers, payload: { operationId: op(), text: '限流' } })).statusCode).toBe(429);
    s.identity.issueSession('test-app', 'reader', 'account');
    const expired = await s.app.inject({ method: 'POST', url: '/api/mini/me/flowers/claim', headers: s.headers, payload: {} });
    expect(expired.statusCode).toBe(401); expect(expired.json().code).toBe('session_replaced');
  });
});
