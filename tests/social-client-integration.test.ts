// @vitest-environment node
/// <reference types="miniprogram-api-typings" />
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { WechatAuthService } from '../server/wechat-auth';
import { TopicStore } from '../server/topic-store';
import { TopicAdminAuthService, createTopicAdminPasswordHash } from '../server/topic-admin-auth';
import { MiniAccountClient, type AccountPlatform, type StoredAccountSession } from '../apps/miniprogram/miniprogram/auth/account-client';
import { MiniSocialClient } from '../apps/miniprogram/miniprogram/social/client';
import { emptyDraft, emptyWritingState, newSession, workFromDraft, type PublicationPreview, type PublicationStatus } from '../packages/core/src/index';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });
const adminOrigin = 'https://social-admin.test';
const password = 'isolated-social-test-only';
const passwordHash = createTopicAdminPasswordHash(password);

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'social-clients-'));
  const identity = new MiniIdentityStore({ path: join(dir, 'auth.sqlite') });
  const topics = new TopicStore({ path: ':memory:' });
  const auth = new TopicAdminAuthService(topics, { username: 'reviewer', passwordHash, secureCookie: false, sessionDurationMs: 3600_000 });
  const service = new WechatAuthService({ appId: 'test-social' }, identity, { exchange: async code => ({ appId: 'test-social', openid: code.split(':')[0]! }) });
  const app = await createGateway({ origin: adminOrigin, miniAuth: { service }, topics, topicAdmin: { auth }, operations: () => undefined });
  const origin = await app.listen({ port: 0, host: '127.0.0.1' });
  disposers.push(async () => { await app.close(); identity.close(); topics.close(); await rm(dir, { recursive: true, force: true }); });
  const login = await fetch(origin + '/api/admin/auth/login', { method: 'POST', headers: { origin: adminOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'reviewer', password }) });
  expect(login.status).toBe(200);
  const adminHeaders = { origin: adminOrigin, cookie: login.headers.getSetCookie().map(v => v.split(';')[0]).join('; '), 'x-csrf-token': (await login.json()).csrfToken, 'content-type': 'application/json' };
  const admin = async (path: string, data?: unknown) => {
    const response = await fetch(origin + '/api/admin/' + path, { method: data ? 'POST' : 'GET', headers: adminHeaders, ...(data ? { body: JSON.stringify(data) } : {}) });
    expect(response.status, path).toBe(200); return response.json();
  };
  function device(name: string) {
    let stored: StoredAccountSession | undefined;
    const faults = { lose: '', offline: false };
    const calls: { path: string; method: string; authorized: boolean; operationId?: string }[] = [];
    const platform: AccountPlatform = {
      login: async () => name + ':' + randomUUID(),
      request: async (path, method, token, data, binary) => {
        calls.push({ path, method, authorized: Boolean(token), operationId: (data as { operationId?: string })?.operationId });
        if (faults.offline) throw new Error('隔离断网');
        const bytes = data instanceof Uint8Array;
        const response = await fetch(origin + path, { method, headers: { 'content-type': bytes ? 'application/octet-stream' : 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
          ...(data === undefined ? {} : { body: bytes ? data as BodyInit : JSON.stringify(data) }) });
        const result = { statusCode: response.status, data: binary && response.ok ? await response.arrayBuffer() : response.status === 204 ? null : await response.json() };
        if (response.ok && faults.lose && path.endsWith(faults.lose)) { faults.lose = ''; throw new Error('已提交后的确认丢失'); }
        return result;
      },
    };
    const account = new MiniAccountClient(platform, { read: async () => stored, write: async v => { stored = structuredClone(v); }, clear: async () => { stored = undefined; } });
    const social = () => { const state = account.snapshot(); return new MiniSocialClient(account.bound(state.generation, state.account?.id ?? null), platform); };
    const request = async <T,>(path: string, data?: unknown, method: 'GET' | 'POST' | 'PUT' = data ? 'POST' : 'GET'): Promise<T> => {
      const result = await account.authorizedRequest(token => platform.request('/api/mini/' + path, method, token, data));
      expect(result.statusCode, path).toBe(200); return result.data as T;
    };
    return { account, social, request, faults, calls };
  }
  const author = device('author'), reader = device('reader'), guest = device('guest');
  await author.account.login(); await reader.account.login();
  const draft = { ...emptyDraft(), title: '隔离文章', inputMode: 'text' as const, textDraft: '这是明确投稿的正文。' };
  await author.request('works/mutations', { operationId: randomUUID(), workId: draft.id, kind: 'create', baseVersion: 0, snapshot: { work: workFromDraft(draft), session: newSession(draft), writingState: emptyWritingState() } });
  const base = 'publications/' + draft.id;
  const picture = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#718375' } }).jpeg().toBuffer();
  const upload = await author.request<{ assetId: string; crops: unknown }>(base + '/images/' + randomUUID(), picture);
  await author.request(base + '/settings', { operationId: randomUUID(), expectedVersion: 0, assetId: upload.assetId, crops: upload.crops }, 'PUT');
  const preview = await author.request<PublicationPreview>(base + '/preview');
  await author.request(base + '/submissions', { operationId: randomUUID(), expectedVersion: preview.version, workVersion: preview.workVersion, settingsVersion: preview.settingsVersion, authorName: preview.authorName });
  const status = await author.request<PublicationStatus>(base);
  await admin('articles/' + preview.articleId + '/actions', { operationId: randomUUID(), expectedVersion: status.version, submissionId: status.pending!.id, action: 'approve', reason: '' });
  const open = async (audience: 'guest' | 'account', version = 0) => author.social().audience(draft.id, { operationId: randomUUID(), expectedVersion: version, audience, consentVersion: 'guest-reading-v1' });
  return { author, reader, guest, device, admin, open, id: preview.articleId, workId: draft.id, base };
}

it('真实客户端经 HTTP 读取受众投影，公开读取无身份，收回同意不受旧图片影响', async () => {
  const s = await setup(), guest = s.guest.social(), reader = s.reader.social();
  await expect(guest.article(s.id, false)).rejects.toMatchObject({ status: 404 });
  const member = await reader.article(s.id, true);
  expect(member.body).toBe('这是明确投稿的正文。');
  const consent = await s.open('guest');
  const article = await guest.article(s.id, false);
  expect(article.publicAuthorId).toBeTruthy();
  expect(article).not.toHaveProperty('workId'); expect(article).not.toHaveProperty('userId');
  expect((await guest.image(s.id, false)).byteLength).toBeGreaterThan(100);
  expect((await guest.articles(article.publicAuthorId!, false)).articles).toHaveLength(1);
  expect(s.guest.calls.every(c => !c.authorized)).toBe(true);
  expect(s.guest.account.snapshot().account).toBeNull();
  await s.open('account', consent.audienceVersion);
  await expect(guest.article(s.id, false)).rejects.toMatchObject({ status: 404 });
  await expect(guest.image(s.id, false)).rejects.toMatchObject({ status: 404 });
  await expect(guest.comments(s.id, false)).rejects.toMatchObject({ status: 404 });
  expect((await reader.article(s.id, true)).id).toBe(s.id);
});

it('客户端关系与收藏互通，待审仅本人可见，审核后公开并可举报隐藏', async () => {
  const s = await setup(); await s.open('guest');
  const reader = s.reader.social(), author = s.author.social(), guest = s.guest.social();
  const article = await reader.article(s.id, true);
  await reader.reaction(s.id, 'collection', { operationId: randomUUID(), expectedVersion: 0, active: true });
  expect((await reader.collections()).collections).toHaveLength(1);
  expect((await author.collections()).collections).toHaveLength(0);
  await reader.follow(article.publicAuthorId!, { operationId: randomUUID(), expectedVersion: 0, active: true });
  const follower = (await author.relationships('followers')).authors[0]!;
  expect((await author.follow(follower.id, { operationId: randomUUID(), expectedVersion: 0, active: true })).mutual).toBe(true);
  expect((await reader.relationships('mutuals')).authors).toHaveLength(1);
  const own = await reader.comment(s.id, ' 一段公开后才可见的评论🌷 ');
  expect(own).toMatchObject({ state: 'pending', text: '一段公开后才可见的评论🌷' });
  expect((await reader.engagement(s.id)).ownComments).toHaveLength(1);
  expect((await author.engagement(s.id)).ownComments).toHaveLength(0);
  expect((await guest.comments(s.id, false)).comments).toHaveLength(0);
  await s.admin('comments/' + own.id + '/actions', { operationId: randomUUID(), expectedVersion: own.version, action: 'approve', reason: '' });
  const comment = (await guest.comments(s.id, false)).comments[0]!;
  expect(comment.text).toBe(own.text);
  await author.report(comment.id, '其他不合适内容');
  expect((await s.admin('comment-reports')).reports).toHaveLength(1);
  await s.admin('comments/' + own.id + '/actions', { operationId: randomUUID(), expectedVersion: comment.version, action: 'hide', reason: '人工处理' });
  expect((await guest.comments(s.id, false)).comments).toHaveLength(0);
});

it('确认丢失后真实客户端沿原操作重试，文章撤下仍只结算一次赠花', async () => {
  const s = await setup(), reader = s.reader.social();
  expect((await reader.claim()).balance).toBe(3);
  s.reader.faults.lose = '/gifts';
  await expect(reader.gift(s.id)).rejects.toThrow('确认丢失');
  expect(reader.hasPending('gift:' + s.id)).toBe(true);
  const status = await s.author.request<PublicationStatus>(s.base);
  await s.admin('articles/' + s.id + '/actions', { operationId: randomUUID(), expectedVersion: status.version, action: 'takedown', reason: '隔离下架' });
  const receipt = await reader.gift(s.id);
  expect(receipt).toMatchObject({ sent: true, balance: 2, flowers: 1 });
  expect(reader.hasPending('gift:' + s.id)).toBe(false);
  const writes = s.reader.calls.filter(c => c.path.endsWith('/gifts'));
  expect(writes).toHaveLength(2); expect(writes[0]!.operationId).toBe(writes[1]!.operationId);
  await expect(reader.gift(s.id)).rejects.toMatchObject({ status: 404 });
  expect((await reader.wallet()).balance).toBe(2);
  expect((await s.author.social().wallet()).balance).toBe(0);
});

it('评论未知结果不接受不同文本重发，旧会话不能将未确认赠送带给新登录', async () => {
  const s = await setup(), reader = s.reader.social();
  s.reader.faults.lose = '/comments';
  await expect(reader.comment(s.id, '保留原提交')).rejects.toThrow('确认丢失');
  await expect(reader.comment(s.id, '修改后不能覆盖原操作')).rejects.toThrow('上次操作');
  const comment = await reader.comment(s.id, '保留原提交');
  expect((await reader.engagement(s.id)).ownComments.map(c => c.id)).toEqual([comment.id]);
  await reader.claim(); s.reader.faults.lose = '/gifts';
  await expect(reader.gift(s.id)).rejects.toThrow('确认丢失');
  const replacement = s.device('reader'); await replacement.account.login();
  await expect(reader.gift(s.id)).rejects.toBeTruthy();
  expect((await replacement.social().wallet()).balance).toBe(2);
  expect((await replacement.social().engagement(s.id)).counts.flowers).toBe(1);
});
