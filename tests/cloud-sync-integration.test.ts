// @vitest-environment node
/// <reference types="miniprogram-api-typings" />
import { mkdtemp, rm, mkdir, readFile, writeFile, readdir, rename, unlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway } from '../server/gateway';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { WechatAuthService } from '../server/wechat-auth';
import type { CloudWorkLimits } from '../server/cloud-work-store';
import { MiniAccountClient, type AccountPlatform, type StoredAccountSession } from '../apps/miniprogram/miniprogram/auth/account-client';
import { MiniCloudTransport } from '../apps/miniprogram/miniprogram/network/cloud';
import { MiniCloudSync } from '../apps/miniprogram/miniprogram/sync/controller';
import { MiniDraftWriter, MiniWorkRepository } from '../apps/miniprogram/miniprogram/storage/repository';
import type { LocalFileSystem } from '../apps/miniprogram/miniprogram/storage/file-system';
import { emptyDraft, newSession, startInterview, prepareDialogue, settleDialogue } from '../packages/core/src/index';

const disposers: Array<() => void | Promise<void>> = [];
class DiskFiles implements LocalFileSystem {
  constructor(readonly root: string) {}
  private path(path: string) { if (!path.startsWith('/device/') || path.includes('..')) throw new Error('Invalid test path'); return join(this.root, path.slice(8)); }
  async ensureDirectory(path: string) { await mkdir(this.path(path), { recursive: true }); }
  async exists(path: string) { try { await access(this.path(path)); return true; } catch { return false; } }
  readText(path: string) { return readFile(this.path(path), 'utf8'); }
  writeText(path: string, value: string) { return writeFile(this.path(path), value, 'utf8'); }
  list(path: string) { return readdir(this.path(path)); }
  rename(from: string, to: string) { return rename(this.path(from), this.path(to)); }
  remove(path: string) { return unlink(this.path(path)); }
}
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });

async function server(cloudWorkLimits?: Partial<CloudWorkLimits>) {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-sync-e2e-'));
  const identity = new MiniIdentityStore({ path: join(directory, 'auth.sqlite') });
  const service = new WechatAuthService({ appId: 'wx-test' }, identity, { exchange: async code => ({ appId: 'wx-test', openid: code.split(':')[0]! }) });
  const app = await createGateway({ origin: 'https://admin.test', miniAuth: { service }, cloudWorkLimits });
  const origin = await app.listen({ port: 0, host: '127.0.0.1' });
  disposers.push(async () => { await app.close(); identity.close(); await rm(directory, { recursive: true, force: true }); });
  let code = 0;
  let deviceNumber = 0;
  async function device(user = 'author', sharedFiles = new DiskFiles(join(directory, `client-${++deviceNumber}`)), stored?: StoredAccountSession, guest?: MiniWorkRepository) {
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
    const sync = new MiniCloudSync(repository, writer, account, new MiniCloudTransport(account.bound(account.snapshot().generation, owner), platform), account.snapshot().generation, guest);
    disposers.push(() => sync.dispose());
    return { account, repository, writer, sync, faults, files: sharedFiles, stored: () => storage! };
  }
  const guestFiles = () => new DiskFiles(join(directory, `guest-${++deviceNumber}`));
  return { device, guestFiles };
}
const draft = (text: string) => ({ ...emptyDraft(), inputMode: 'text' as const, textDraft: text, title: '测试作品', pendingVoice: '待确认文字' });

describe('双客户端真实 HTTP 网关、SQLite 与独立磁盘目录联调（微信换码替身）', () => {
  it('第二设备恢复文章与已发送会话，不恢复输入框；旧本机未上传稿变成独立恢复稿', async () => {
    const { device } = await server();
    const a = await device();
    const original = draft('第一版');
    a.writer.setWritingState(original.id, { composer: '未发给小文', inputSource: 'typed' });
    let scene = startInterview(newSession(original), original, 'scene-start');
    scene = prepareDialogue(scene, original, 'scene-turn', '我在工厂工作了三十年。', 'send');
    scene = { ...scene, turns: [{ id: 'scene-turn', action: 'dialogue', command: 'send', prompt: '我在工厂工作了三十年。',
      createdAt: new Date().toISOString(), inputVersionId: scene.versions[0]!.id, status: 'running' }] };
    scene = settleDialogue(scene, 'scene-turn', { answer: '那段工作里最难忘的事是什么？', citedVersionIds: [], dialogue: { intent: 'reply', material: { text: '我在工厂工作了三十年。' } } });
    await a.writer.write(original, scene);
    await a.sync.sync();
    a.sync.pause();
    await a.writer.write({ ...original, textDraft: '旧设备未上传' });
    const b = await device();
    await b.sync.sync();
    const received = (await b.repository.getAggregate(original.id))!;
    expect(received.writingState?.composer).toBe('');
    expect(received.work.draft.pendingVoice).toBe('');
    expect(received.session?.workId).toBe(original.id);
    expect(received.session).toEqual(scene);
    expect(received.session?.conversation).toMatchObject({ mode: 'interview', materials: [{ text: '我在工厂工作了三十年。' }] });
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

  it('容量满后保留未上传作品，仍可查看最新云作品并清空回收站释放容量', async () => {
    const { device } = await server({ maxWorks: 1 });
    const a = await device();
    const first = draft('已入云');
    await a.writer.write(first); await a.sync.sync();
    const next = draft('容量失败也必须留下');
    await a.writer.write(next);
    await expect(a.sync.sync()).rejects.toMatchObject({ status: 413 });
    expect((await a.repository.getAggregate(next.id))!.work.draft.textDraft).toBe(next.textDraft);
    await a.sync.open(first.id);
    expect(a.sync.canEdit(first.id, 1)).toBe(true);
    let current = (await a.repository.getAggregate(first.id))!;
    await a.sync.lifecycle(first.id, 'trash', current.work.revision);
    current = (await a.repository.getAggregate(first.id))!;
    await a.sync.lifecycle(first.id, 'purge', current.work.revision);
    await a.sync.sync();
    const saved = (await a.repository.getAggregate(next.id))!;
    expect(saved.cloud).toMatchObject({ version: 1, operation: null, syncedRevision: saved.work.revision });
  });

  it('首次入云遇 ID 碰撞创建新标识，认领中断重启后连同回收站只上传一次', async () => {
    const { device, guestFiles } = await server();
    const a = await device();
    const original = draft('已有云正文');
    await a.writer.write(original); await a.sync.sync();
    const files = guestFiles();
    const guest = new MiniWorkRepository(files, '/device');
    await guest.save({ ...original, textDraft: '同 ID 本机正文' }, 0);
    const trashed = draft('本机回收站');
    const saved = (await guest.save(trashed, 0))!;
    await guest.setDeleted(trashed.id, true, saved.revision);
    const claim = guest.claim.bind(guest);
    guest.claim = async (id, owner, targetId, complete) => {
      if (complete) throw new Error('认领复制完成后进程中断');
      return claim(id, owner, targetId, complete);
    };
    const b = await device('author', undefined, undefined, guest);
    await expect(b.sync.sync()).rejects.toThrow('进程中断');
    b.sync.dispose();
    const resumedGuest = new MiniWorkRepository(files, '/device');
    const resumed = await device('author', b.files, b.stored(), resumedGuest);
    await resumed.sync.sync(); await resumed.sync.sync();
    const local = await resumed.repository.allAggregates();
    expect(local).toHaveLength(3);
    expect(local.find(item => item.work.id === original.id)?.work.draft.textDraft).toBe('已有云正文');
    expect(local.find(item => item.work.draft.textDraft === '同 ID 本机正文')?.work.id).not.toBe(original.id);
    expect(local.find(item => item.work.id === trashed.id)?.work.deletedAt).toBeTruthy();
    expect(await resumedGuest.allAggregates()).toEqual([]);
    const remote = await resumed.account.request('/api/mini/works') as { entries: unknown[] };
    expect(remote.entries).toHaveLength(3);
  });
});
