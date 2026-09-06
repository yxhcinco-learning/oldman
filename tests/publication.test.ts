// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { WechatAuthService } from '../server/wechat-auth';
import { TopicStore } from '../server/topic-store';
import { TopicAdminAuthService, createTopicAdminPasswordHash } from '../server/topic-admin-auth';
import { PublicationStore } from '../server/publication-store';
import { AccountStore } from '../server/account-store';
import { emptyDraft, workFromDraft, emptyWritingState, newSession, type WorkSnapshot } from '../packages/core/src/index';
import { type PublicationPreview, type PublicationStatus, type PublicArticlePage } from '../packages/core/src/publication-protocol';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const origin = 'https://admin.test';
const hash = createTopicAdminPasswordHash('test-publication-password');
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'suiyue-publication-')), path = join(dir, 'auth.sqlite');
  const identity = new MiniIdentityStore({ path }), topics = new TopicStore({ path: ':memory:' });
  const service = new WechatAuthService({ appId: 'test-app' }, identity, { exchange: async code => ({ appId: 'test-app', openid: code.split(':')[0]! }) });
  const auth = new TopicAdminAuthService(topics, { username: 'reviewer', passwordHash: hash, secureCookie: false, sessionDurationMs: 3600_000 });
  const logs: unknown[] = [];
  const app = await createGateway({ origin, miniAuth: { service }, topics, topicAdmin: { auth }, operations: entry => logs.push(entry) });
  cleanups.push(async () => { await app.close(); identity.close(); topics.close(); await rm(dir, { recursive: true, force: true }); });
  const login = async (name: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/mini/account/login', payload: { code: name + ':' + randomUUID() } });
    expect(r.statusCode).toBe(200);
    return r.json() as { token: string; account: { id: string; nickname: string } };
  };
  const a = await login('author'), b = await login('reader');
  const headers = { authorization: 'Bearer ' + a.token };
  const other = { authorization: 'Bearer ' + b.token };
  const adminLogin = await app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { origin }, payload: { username: 'reviewer', password: 'test-publication-password' } });
  expect(adminLogin.statusCode).toBe(200);
  const admin = { cookie: adminLogin.cookies.map(c => c.name + '=' + c.value).join('; '), origin, 'x-csrf-token': adminLogin.json().csrfToken as string };
  const draft = { ...emptyDraft(), title: '投稿测试', inputMode: 'text' as const, textDraft: '确认后的文章正文', pendingVoice: '私有待确认语音' };
  const snapshot: WorkSnapshot = { work: workFromDraft(draft), session: newSession(draft), writingState: { ...emptyWritingState(), composer: '私有未发送输入' } };
  const workId = draft.id, base = '/api/mini/publications/' + workId;
  const mutate = (kind: 'create' | 'save' | 'trash' | 'restore' | 'purge', baseVersion: number, data?: WorkSnapshot) =>
    app.inject({ method: 'POST', url: '/api/mini/works/mutations', headers, payload: { operationId: randomUUID(), workId, kind, baseVersion, ...(data ? { snapshot: data } : {}) } });
  expect((await mutate('create', 0, snapshot)).statusCode).toBe(200);
  const picture = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#718375' } }).jpeg().toBuffer();
  const upload = await app.inject({ method: 'POST', url: base + '/images/' + randomUUID(), headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: picture });
  expect(upload.statusCode).toBe(200);
  const setting = { operationId: randomUUID(), expectedVersion: 0, assetId: upload.json().assetId as string, crops: upload.json().crops };
  expect((await app.inject({ method: 'PUT', url: base + '/settings', headers, payload: setting })).statusCode).toBe(200);
  const status = async () => (await app.inject({ url: base, headers })).json<PublicationStatus>();
  const preview = async () => (await app.inject({ url: base + '/preview', headers })).json<PublicationPreview>();
  const submit = async (operationId = randomUUID()) => {
    const p = await preview();
    const payload = { operationId, workVersion: p.workVersion, settingsVersion: p.settingsVersion, authorName: p.authorName, expectedVersion: p.version };
    const response = await app.inject({ method: 'POST', url: base + '/submissions', headers, payload });
    return { response, payload, articleId: p.articleId };
  };
  const review = async (articleId: string, action: 'approve' | 'reject' | 'takedown', reason = '', expectedVersion?: number, operationId = randomUUID()) =>
    app.inject({ method: 'POST', url: '/api/admin/articles/' + articleId + '/actions', headers: admin,
      payload: { action, reason, expectedVersion: expectedVersion ?? (await status()).version, operationId } });
  return { app, identity, path, topics, a, b, headers, other, admin, base, status, preview, submit, review, mutate, snapshot, workId, picture, setting, login, logs };
}

describe('文章发表与人工审核', () => {
  it('只冻结确认正文，必须人工通过，双账号读取且响应没有私有字段', async () => {
    const s = await setup(), p = await s.preview();
    expect(p).toMatchObject({ title: '投稿测试', body: '确认后的文章正文', authorName: s.a.account.nickname });
    const submitted = await s.submit();
    expect(submitted.response.statusCode).toBe(200);
    expect((await s.app.inject({ url: '/api/mini/articles/' + p.articleId, headers: s.other })).statusCode).toBe(404);
    expect((await s.app.inject({ url: '/api/admin/articles', headers: s.admin })).json().articles).toHaveLength(1);
    expect((await s.review(p.articleId, 'approve')).statusCode).toBe(200);
    const visible = await s.app.inject({ url: '/api/mini/articles/' + p.articleId, headers: s.other });
    expect(visible.statusCode).toBe(200);
    expect(Object.keys(visible.json()).sort()).toEqual(['aiAssisted', 'authorName', 'body', 'id', 'publishedAt', 'title', 'version'].sort());
    expect(visible.body).not.toContain('私有');
    expect(JSON.stringify(s.logs)).not.toContain('确认后的文章正文');
    expect((await s.app.inject({ url: '/api/mini/articles/' + p.articleId })).statusCode).toBe(401);
  });
  it('同操作重试返回同回执，变更正文或署名必须重新预览', async () => {
    const s = await setup(), { response, payload } = await s.submit();
    expect((await s.app.inject({ method: 'POST', url: s.base + '/submissions', headers: s.headers, payload })).json()).toEqual(response.json());
    expect((await s.app.inject({ method: 'POST', url: s.base + '/submissions', headers: s.headers, payload: { ...payload, authorName: '其他名字' } })).statusCode).toBe(409);
    expect((await s.submit()).response.statusCode).toBe(409);
    await s.app.inject({ method: 'POST', url: s.base + '/actions', headers: s.headers,
      payload: { operationId: randomUUID(), action: 'withdraw-review', expectedVersion: (await s.status()).version } });
    const p = await s.preview();
    new AccountStore(s.identity).updateNickname(s.a.token, '更名之后');
    expect((await s.app.inject({ method: 'POST', url: s.base + '/submissions', headers: s.headers,
      payload: { operationId: randomUUID(), expectedVersion: p.version, workVersion: p.workVersion, settingsVersion: p.settingsVersion, authorName: p.authorName } })).statusCode).toBe(409);
  });
  it('改稿驳回保持公开旧版，通过后替换同一文章并保留首次发表时间', async () => {
    const s = await setup(), first = await s.submit();
    await s.review(first.articleId, 'approve');
    const old = (await s.app.inject({ url: '/api/mini/articles/' + first.articleId, headers: s.other })).json();
    s.snapshot.work = workFromDraft({ ...s.snapshot.work.draft, textDraft: '新的确认正文' }, s.snapshot.work);
    expect((await s.mutate('save', 1, s.snapshot)).statusCode).toBe(200);
    await s.submit();
    expect((await s.review(first.articleId, 'reject', '请补充说明')).statusCode).toBe(200);
    expect((await s.app.inject({ url: '/api/mini/articles/' + first.articleId, headers: s.other })).json().body).toBe(old.body);
    expect((await s.status()).lastSubmission?.reason).toBe('请补充说明');
    await s.submit(); await s.review(first.articleId, 'approve');
    const page = (await s.app.inject({ url: '/api/mini/articles', headers: s.other })).json<PublicArticlePage>();
    expect(page.articles).toHaveLength(1);
    const next = (await s.app.inject({ url: '/api/mini/articles/' + first.articleId, headers: s.other })).json();
    expect(next.body).toBe('新的确认正文'); expect(next.publishedAt).toBe(old.publishedAt);
  });
  it('撤回、下架和旧客户端删除保护正文与图片，旧审核不能复活', async () => {
    const s = await setup(), first = await s.submit(), pendingVersion = (await s.status()).version;
    expect((await s.app.inject({ method: 'POST', url: s.base + '/actions', headers: s.headers,
      payload: { operationId: randomUUID(), action: 'withdraw-review', expectedVersion: pendingVersion } })).statusCode).toBe(200);
    expect((await s.review(first.articleId, 'approve', '', pendingVersion)).statusCode).toBe(409);
    await s.submit(); await s.review(first.articleId, 'approve');
    await s.submit();
    const stale = (await s.status()).version;
    expect((await s.review(first.articleId, 'takedown', '需要核实')).statusCode).toBe(200);
    expect((await s.review(first.articleId, 'approve', '', stale)).statusCode).toBe(409);
    expect((await s.app.inject({ url: '/api/mini/articles/' + first.articleId + '/images/reading', headers: s.other })).statusCode).toBe(404);
    await s.submit(); await s.review(first.articleId, 'approve');
    expect((await s.mutate('trash', 1)).statusCode).toBe(200);
    expect((await s.app.inject({ url: '/api/mini/articles/' + first.articleId, headers: s.other })).statusCode).toBe(404);
    expect((await s.mutate('restore', 2)).statusCode).toBe(200);
    expect((await s.status()).published).toBe(false);
    await s.submit();
    await s.mutate('trash', 3); await s.mutate('purge', 4);
    const db = new DatabaseSync(s.path);
    expect(db.prepare('SELECT count(*) AS n FROM publication_submissions').get()?.n).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM publication_assets').get()?.n).toBe(0);
    db.close();
    expect((await s.review(first.articleId, 'approve')).statusCode).not.toBe(200);
  });
  it('管理员不能访问未投稿封面，Origin/CSRF/用户权限都独立校验', async () => {
    const s = await setup(), p = await s.preview();
    expect((await s.app.inject({ url: s.base + '/preview', headers: s.other })).statusCode).toBe(404);
    expect((await s.app.inject({ url: s.base + '/images/' + p.assetId + '/master', headers: s.admin })).statusCode).toBe(401);
    expect((await s.app.inject({ url: '/api/admin/articles', headers: s.headers })).statusCode).toBe(401);
    await s.submit();
    const url = '/api/admin/articles/' + p.articleId + '/actions';
    const payload = { operationId: randomUUID(), expectedVersion: (await s.status()).version, action: 'approve' };
    expect((await s.app.inject({ method: 'POST', url, headers: { ...s.admin, origin: 'https://evil.test' }, payload })).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url, headers: { ...s.admin, 'x-csrf-token': 'wrong' }, payload })).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url: s.base + '/actions', headers: s.headers, payload })).statusCode).toBe(403);
  });
  it('图片处理与配额失败保留旧封面，过期未引用图清理，过期会话拒绝上传', async () => {
    const s = await setup(), old = await s.status();
    const bad = await s.app.inject({ method: 'POST', url: s.base + '/images/' + randomUUID(), headers: { ...s.headers, 'content-type': 'application/octet-stream' }, payload: Buffer.from('invalid') });
    expect(bad.statusCode).toBe(400); expect((await s.status()).settings).toEqual(old.settings);
    const image = await s.app.inject({ url: s.base + '/images/' + old.settings.assetId + '/thumbnail', headers: s.headers });
    expect(await sharp(image.rawPayload).metadata()).toMatchObject({ width: 400, height: 400, format: 'jpeg' });
    expect((await sharp(image.rawPayload).metadata()).exif).toBeUndefined();
    await expect(new PublicationStore(s.identity, Date.now, 1).upload(s.a.token, s.workId, randomUUID(), s.picture)).rejects.toMatchObject({ code: 'publication_capacity' });
    expect((await s.app.inject({ method: 'PUT', url: s.base + '/settings', headers: s.headers, payload: { ...s.setting, operationId: randomUUID() } })).statusCode).toBe(409);
    const later = new PublicationStore(s.identity, () => Date.now() + 8 * 86400_000);
    later.cleanup();
    const db = new DatabaseSync(s.path);
    expect(db.prepare('SELECT count(*) AS n FROM publication_assets').get()?.n).toBe(1); db.close();
    await s.login('author');
    expect((await s.app.inject({ method: 'POST', url: s.base + '/images/' + randomUUID(), headers: { ...s.headers, 'content-type': 'application/octet-stream' }, payload: s.picture })).statusCode).toBe(401);
  });
  it('真实本地 HTTP 网关供两个独立会话读取审核结果', async () => {
    const s = await setup(), address = await s.app.listen({ port: 0, host: '127.0.0.1' });
    const submitted = await s.submit();
    expect((await fetch(address + '/api/mini/articles', { headers: s.other }).then(r => r.json())).articles).toEqual([]);
    const approved = await fetch(address + '/api/admin/articles/' + submitted.articleId + '/actions',
      { method: 'POST', headers: { ...s.admin, 'content-type': 'application/json' },
        body: JSON.stringify({ operationId: randomUUID(), expectedVersion: (await s.status()).version, action: 'approve' }) });
    expect(approved.status).toBe(200);
    const visible = await fetch(address + '/api/mini/articles/' + submitted.articleId, { headers: s.other });
    expect(visible.status).toBe(200); expect((await visible.json()).body).toBe('确认后的文章正文');
  });
});

describe('唯一用户名迁移与历史归属', () => {
  it('分配唯一默认名、规范化抢名、保留旧名并允许原账号改回', async () => {
    const s = await setup(), accounts = new AccountStore(s.identity);
    expect(s.a.account.nickname).toMatch(/^岁月作者\d+$/); expect(s.a.account.nickname).not.toBe(s.b.account.nickname);
    expect(accounts.updateNickname(s.a.token, ' Alice ').nickname).toBe('Alice');
    expect(() => accounts.updateNickname(s.b.token, 'ＡＬＩＣＥ')).toThrow('已被使用');
    accounts.updateNickname(s.a.token, '新的名字');
    expect(() => accounts.updateNickname(s.b.token, 'alice')).toThrow('已被使用');
    expect(accounts.updateNickname(s.a.token, 'Alice').nickname).toBe('Alice');
  });
  it('真实 schema 2 重名与空名迁移不覆盖作品，先预留合法旧名', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suiyue-schema2-')), path = join(dir, 'auth.sqlite');
    const initial = new MiniIdentityStore({ path }); initial.close();
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys=OFF;');
    for (const table of ['publication_audit', 'publication_operations', 'publication_submissions', 'publication_assets', 'publication_articles', 'username_claims', 'username_sequence']) db.exec('DROP TABLE ' + table);
    for (const [i, name] of ['老张', '老张', '', '岁月作者000001'].entries()) {
      db.prepare('INSERT INTO users(id,created_at,updated_at) VALUES(?,?,?)').run('u' + i, i, i);
      db.prepare('INSERT INTO mini_accounts(user_id,nickname,created_at) VALUES(?,?,?)').run('u' + i, name, i);
    }
    db.exec("INSERT INTO cloud_works(user_id,id,version,sequence,title,updated_at,bytes) VALUES('u0','old-work',1,1,'旧作品','2026-09-07T00:00:00.000Z',0); PRAGMA user_version=2;");
    db.close();
    const upgraded = new MiniIdentityStore({ path });
    cleanups.push(async () => { upgraded.close(); await rm(dir, { recursive: true, force: true }); });
    expect(upgraded.statistics().schemaVersion).toBe(3);
    const inspect = new DatabaseSync(path);
    const names = inspect.prepare('SELECT nickname FROM mini_accounts ORDER BY user_id').all().map(row => row.nickname);
    expect(names[0]).toBe('老张'); expect(names[1]).toMatch(/^老张\d+$/);
    expect(names[3]).toBe('岁月作者000001'); expect(new Set(names).size).toBe(4);
    expect(inspect.prepare('SELECT title FROM cloud_works').get()?.title).toBe('旧作品'); inspect.close();
  });
});
