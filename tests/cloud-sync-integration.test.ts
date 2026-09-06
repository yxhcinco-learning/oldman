// @vitest-environment node
/// <reference types="miniprogram-api-typings" />
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { WechatAuthService } from '../server/wechat-auth';
import { MiniAccountClient, type AccountPlatform, type StoredAccountSession } from '../apps/miniprogram/miniprogram/auth/account-client';
import { MiniCloudTransport } from '../apps/miniprogram/miniprogram/network/cloud';
import { MiniCloudSync } from '../apps/miniprogram/miniprogram/sync/controller';
import { MiniDraftWriter, MiniWorkRepository } from '../apps/miniprogram/miniprogram/storage/repository';
import { MemoryFileSystem } from '../apps/miniprogram/tests/memory-file-system';
import { emptyDraft, newSession } from '../packages/core/src/index';

const disposers: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });

async function server() {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-sync-e2e-'));
  const identity = new MiniIdentityStore({ path: join(directory, 'auth.sqlite') });
  const service = new WechatAuthService({ appId: 'wx-test' }, identity, { exchange: async code => ({ appId: 'wx-test', openid: code.split(':')[0]! }) });
  const app = await createGateway({ origin: 'https://admin.test', miniAuth: { service } });
  const origin = await app.listen({ port: 0, host: '127.0.0.1' });
  disposers.push(async () => { await app.close(); identity.close(); await rm(directory, { recursive: true, force: true }); });
  let code = 0;
  async function device(user = 'author', sharedFiles = new MemoryFileSystem(), stored?: StoredAccountSession) {
    let storage = stored;
    const faults = { offline: false, loseAck: false, afterMutation: undefined as (() => Promise<void>) | undefined };
    const platform: AccountPlatform = {
      login: async () => `${user}:${++code}`,
      request: async (path, method, token, data) => {
        if (faults.offline) throw new Error('断网');
        const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
        const result = { statusCode: response.status, data: response.status === 204 ? null : await response.json() };
        if (path.endsWith('/mutations') && response.ok) {
          await faults.afterMutation?.();
          if (faults.loseAck) { faults.loseAck = false; throw new Error('确认丢失'); }
        }
        return result;
      },
    };
    const account = new MiniAccountClient(platform, { read: async () => storage, write: async value => { storage = structuredClone(value); }, clear: async () => { storage = undefined; } });
    if (stored) await account.restore(); else await account.login();
    const owner = account.snapshot().account!.id;
    const repository = new MiniWorkRepository(sharedFiles, '/device', undefined, owner);
    const writer = new MiniDraftWriter(repository);
    const sync = new MiniCloudSync(repository, writer, account, new MiniCloudTransport(account.bound(account.snapshot().generation, owner), platform), account.snapshot().generation);
    disposers.push(() => sync.dispose());
    return { account, repository, writer, sync, faults, files: sharedFiles, stored: () => storage! };
  }
  return { device };
}
const draft = (text: string) => ({ ...emptyDraft(), inputMode: 'text' as const, textDraft: text, title: '测试作品', pendingVoice: '待确认文字' });

describe('双客户端真实 HTTP 网关与 SQLite 联调（微信与 wx 文件 API 替身）', () => {
  it('第二设备恢复完整现场，旧会话停止；旧本机未上传稿变成独立恢复稿', async () => {
    const { device } = await server();
    const a = await device();
    const original = draft('第一版');
    a.writer.setWritingState(original.id, { composer: '未发给小文', inputSource: 'typed' });
    await a.writer.write(original, newSession(original));
    await a.sync.sync();
    a.sync.pause();
    await a.writer.write({ ...original, textDraft: '旧设备未上传' });
    const b = await device();
    await b.sync.sync();
    const received = (await b.repository.getAggregate(original.id))!;
    expect(received.writingState?.composer).toBe('未发给小文');
    expect(received.work.draft.pendingVoice).toBe('待确认文字');
    expect(received.session?.workId).toBe(original.id);
    b.writer.seed(original.id, received.work.revision);
    await b.writer.write({ ...received.work.draft, textDraft: '新设备续写' }, received.session!);
    await b.sync.sync();
    await expect(a.sync.sync()).rejects.toBeDefined();
    expect(a.account.snapshot().status).toBe('replaced');
    a.sync.dispose();
    const resumed = await device('author', a.files);
    await resumed.sync.sync();
    const values = await resumed.repository.allAggregates();
    expect(values.find(item => item.work.id === original.id)?.work.draft.textDraft).toBe('新设备续写');
    expect(values.find(item => item.cloud?.recoveryOf === original.id)?.work.draft.textDraft).toBe('旧设备未上传');
    const remote = await resumed.account.request('/api/mini/works') as { entries: unknown[] };
    expect(remote.entries).toHaveLength(1);
  });

  it('服务已提交但确认丢失，重启重放固定操作且不产生副本', async () => {
    const { device } = await server();
    const a = await device();
    const original = draft('保住我');
    await a.writer.write(original);
    a.faults.loseAck = true;
    await expect(a.sync.sync()).rejects.toThrow('确认丢失');
    const frozen = (await a.repository.getAggregate(original.id))!.cloud!.operation;
    expect(frozen).not.toBeNull();
    a.sync.dispose();
    const resumed = await device('author', a.files, a.stored());
    await resumed.sync.sync();
    const saved = (await resumed.repository.getAggregate(original.id))!;
    expect(saved.cloud).toMatchObject({ version: 1, operation: null, syncedRevision: saved.work.revision });
    expect(await resumed.repository.allAggregates()).toHaveLength(1);
  });

  it('上传期间新输入不被旧 ACK 标记已同步，下一次提交才确认', async () => {
    const { device } = await server();
    const a = await device();
    const original = draft('发送中的正文');
    await a.writer.write(original);
    a.faults.afterMutation = async () => { a.faults.afterMutation = undefined; await a.writer.write({ ...original, textDraft: '后输入的正文' }); };
    await a.sync.sync();
    const pending = (await a.repository.getAggregate(original.id))!;
    expect(pending.cloud!.syncedRevision).toBeLessThan(pending.work.revision);
    await a.sync.sync();
    const settled = (await a.repository.getAggregate(original.id))!;
    expect(settled.cloud!.syncedRevision).toBe(settled.work.revision);
    expect(settled.work.draft.textDraft).toBe('后输入的正文');
  });

  it('云删除同步且旧设备不能恢复已永久删除作品，离线新稿仍可本机保存', async () => {
    const { device } = await server();
    const a = await device();
    const original = draft('删除测试');
    await a.writer.write(original); await a.sync.sync();
    const b = await device(); await b.sync.sync();
    let current = (await b.repository.getAggregate(original.id))!;
    await b.sync.lifecycle(original.id, 'trash', current.work.revision);
    current = (await b.repository.getAggregate(original.id))!;
    await b.sync.lifecycle(original.id, 'purge', current.work.revision);
    a.sync.dispose();
    const resumed = await device('author', a.files); await resumed.sync.sync();
    expect(await resumed.repository.getAggregate(original.id)).toBeNull();
    resumed.faults.offline = true; resumed.account.setOffline(); resumed.sync.pause();
    expect(resumed.sync.canEdit(original.id, 1)).toBe(false);
    const offline = draft('离线新稿');
    await resumed.writer.write(offline);
    expect(resumed.sync.canEdit(offline.id, 0)).toBe(true);
    expect((await resumed.repository.getAggregate(offline.id))!.work.draft.textDraft).toBe('离线新稿');
  });
});
