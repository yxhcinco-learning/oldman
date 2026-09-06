// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { WechatAuthService } from '../server/wechat-auth';
import { CloudWorkStore } from '../server/cloud-work-store';
import { emptyDraft, workFromDraft, newSession, emptyWritingState, type WorkSnapshot } from '../packages/core/src/index';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function setup(maxAccountBytes?: number) {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-cloud-'));
  const path = join(directory, 'auth.sqlite');
  const identity = new MiniIdentityStore({ path });
  cleanup.push(async () => { identity.close(); await rm(directory, { recursive: true, force: true }); });
  const service = new WechatAuthService({ appId: 'wx-test' }, identity, { exchange: async code => ({ appId: 'wx-test', openid: code.split(':')[0]! }) });
  const app = await createGateway({ origin: 'https://admin.test', miniAuth: { service }, ...(maxAccountBytes ? { cloudWorkLimits: { maxAccountBytes } } : {}) });
  cleanup.push(() => app.close());
  const login = async (code: string) => {
    const response = await app.inject({ method: 'POST', url: '/api/mini/account/login', payload: { code } });
    expect(response.statusCode).toBe(200);
    return response.json() as { token: string; account: { id: string } };
  };
  const send = (token: string, payload: object) => app.inject({ method: 'POST', url: '/api/mini/works/mutations', headers: { authorization: `Bearer ${token}` }, payload });
  return { app, identity, path, login, send };
}
const snapshot = (): WorkSnapshot => {
  const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '私人正文', title: '日记', pendingVoice: '待确认语音' };
  return { work: workFromDraft(draft), session: newSession(draft), writingState: { ...emptyWritingState(), composer: '还没发送' } };
};

describe('真实 SQLite 账号与私有云 API', () => {
  it('同微信单会话、续期、旧端不能抢占，其他账号与旧最小身份不能读取作品', async () => {
    const { app, identity, login, send } = await setup();
    const old = identity.issueSession('wx-test', 'alice');
    const a = await login('alice:one');
    const draft = snapshot();
    expect((await send(a.token, { operationId: 'create-one', workId: draft.work.id, kind: 'create', baseVersion: 0, snapshot: draft })).statusCode).toBe(200);
    const b = await login('alice:two');
    expect(b.account.id).toBe(a.account.id);
    expect((await app.inject({ url: '/api/mini/account/me', headers: { authorization: `Bearer ${a.token}` } })).json().code).toBe('session_replaced');
    expect((await app.inject({ method: 'POST', url: '/api/mini/account/session/renew', headers: { authorization: `Bearer ${b.token}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/mini/auth/wechat', payload: { code: 'alice:legacy' } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/mini/works/${draft.work.id}`, headers: { authorization: `Bearer ${old.token}` } })).statusCode).toBe(401);
    const stranger = await login('bob:one');
    expect((await app.inject({ url: `/api/mini/works/${draft.work.id}`, headers: { authorization: `Bearer ${stranger.token}` } })).statusCode).toBe(404);
  });

  it('固定操作重试不增版本、不同内容拒绝、旧基线拒绝，保留全部写作现场', async () => {
    const { app, path, login, send } = await setup();
    const { token } = await login('writer:one');
    const content = snapshot();
    const create = { operationId: 'create', workId: content.work.id, kind: 'create', baseVersion: 0, snapshot: content };
    const first = await send(token, create);
    expect(first.statusCode).toBe(200);
    expect((await send(token, create)).json()).toEqual(first.json());
    expect((await send(token, { ...create, snapshot: { ...content, writingState: { composer: '不同内容', inputSource: 'typed' } } })).json().code).toBe('operation_mismatch');
    const changed = { ...content, writingState: { composer: '新输入', inputSource: 'typed' } };
    expect((await send(token, { operationId: 'save', workId: content.work.id, kind: 'save', baseVersion: 1, snapshot: changed })).json().entry.version).toBe(2);
    expect((await send(token, { operationId: 'stale', workId: content.work.id, kind: 'save', baseVersion: 1, snapshot: content })).json().code).toBe('version_conflict');
    const remote = await app.inject({ url: `/api/mini/works/${content.work.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(remote.json().snapshot).toEqual(changed);
    const reopened = new MiniIdentityStore({ path });
    try { expect(new CloudWorkStore(reopened).get(token, content.work.id).snapshot).toEqual(changed); } finally { reopened.close(); }
    const db = new DatabaseSync(path);
    try { expect(JSON.stringify(db.prepare('SELECT * FROM cloud_operations').all())).not.toContain('私人正文'); } finally { db.close(); }
  });

  it('回收站、恢复、永久删除和旧队列不复活', async () => {
    const { app, login, send } = await setup();
    const { token } = await login('writer:one');
    const content = snapshot(), workId = content.work.id;
    await send(token, { operationId: 'create', workId, kind: 'create', baseVersion: 0, snapshot: content });
    await send(token, { operationId: 'trash', workId, kind: 'trash', baseVersion: 1 });
    await send(token, { operationId: 'restore', workId, kind: 'restore', baseVersion: 2 });
    expect((await send(token, { operationId: 'early-purge', workId, kind: 'purge', baseVersion: 3 })).statusCode).toBe(409);
    await send(token, { operationId: 'trash-again', workId, kind: 'trash', baseVersion: 3 });
    const purge = { operationId: 'purge', workId, kind: 'purge', baseVersion: 4 };
    const result = (await send(token, purge)).json();
    expect((await send(token, purge)).json()).toEqual(result);
    const remote = (await app.inject({ url: `/api/mini/works/${workId}`, headers: { authorization: `Bearer ${token}` } })).json();
    expect(remote).toMatchObject({ purged: true, title: '', snapshot: null });
    expect((await send(token, { operationId: 'resurrect', workId, kind: 'create', baseVersion: 0, snapshot: content })).json().code).toBe('work_purged');
    const changes = (await app.inject({ url: '/api/mini/works?cursor=1', headers: { authorization: `Bearer ${token}` } })).json();
    expect(changes.entries).toHaveLength(1);
    expect(changes.entries[0].purged).toBe(true);
  });

  it('资料与私有头像校验、去除元数据、失败不覆盖', async () => {
    const { app, login } = await setup();
    const { token } = await login('writer:one');
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'PATCH', url: '/api/mini/account/me', headers, payload: { nickname: '作者' } })).json().nickname).toBe('作者');
    expect((await app.inject({ method: 'PATCH', url: '/api/mini/account/me', headers, payload: { nickname: 'x'.repeat(65) } })).statusCode).toBe(400);
    const input = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#abcdef' } }).png().toBuffer();
    const upload = await app.inject({ method: 'PUT', url: '/api/mini/account/avatar', headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: input });
    expect(upload.statusCode).toBe(200);
    const avatar = await app.inject({ url: '/api/mini/account/avatar', headers });
    expect(await sharp(avatar.rawPayload).metadata()).toMatchObject({ width: 256, height: 256, format: 'jpeg' });
    expect((await sharp(avatar.rawPayload).metadata()).exif).toBeUndefined();
    expect((await app.inject({ url: '/api/mini/account/avatar' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: '/api/mini/account/avatar', headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: Buffer.from('<svg/>') })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/mini/account/avatar', headers })).rawPayload).toEqual(avatar.rawPayload);
  });

  it('容量失败不提交半篇作品或操作回执', async () => {
    const { app, login, send } = await setup(10);
    const { token } = await login('writer:one');
    const content = snapshot();
    expect((await send(token, { operationId: 'create', workId: content.work.id, kind: 'create', baseVersion: 0, snapshot: content })).statusCode).toBe(413);
    expect((await app.inject({ url: '/api/mini/works', headers: { authorization: `Bearer ${token}` } })).json().entries).toEqual([]);
  });

  it('回执落库失败回滚正文与账号序号，原操作可安全重试', async () => {
    const { app, path, login, send } = await setup();
    const { token } = await login('writer:one');
    const content = snapshot();
    const operation = { operationId: 'database-failure', workId: content.work.id, kind: 'create', baseVersion: 0, snapshot: content };
    const database = new DatabaseSync(path);
    try {
      database.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON cloud_operations BEGIN SELECT RAISE(ABORT, 'injected database failure'); END");
      expect((await send(token, operation)).statusCode).toBe(503);
      expect(database.prepare('SELECT COUNT(*) AS count FROM cloud_works').get()).toMatchObject({ count: 0 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM cloud_operations').get()).toMatchObject({ count: 0 });
      expect(database.prepare('SELECT sequence FROM mini_accounts').get()).toMatchObject({ sequence: 0 });
      database.exec('DROP TRIGGER fail_receipt');
      const retried = await send(token, operation);
      expect(retried.statusCode).toBe(200);
      expect(retried.json().entry).toMatchObject({ version: 1, sequence: 1 });
      expect((await app.inject({ url: `/api/mini/works/${content.work.id}`, headers: { authorization: `Bearer ${token}` } })).json().snapshot).toEqual(content);
    } finally { database.close(); }
  });
});
