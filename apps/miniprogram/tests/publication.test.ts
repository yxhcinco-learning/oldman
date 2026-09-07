import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { MemoryFileSystem } from './memory-file-system';
import { MiniPublicationStorage, type PublicationFiles } from '../miniprogram/publication/storage';
import { MiniPublicationController } from '../miniprogram/publication/controller';
import { MiniPublicationClient } from '../miniprogram/publication/client';
import { centeredCrops, emptyDraft, type PublicationPreview, type PublicationStatus } from '../miniprogram/domain/core';
import { MiniWorkRepository } from '../miniprogram/storage/repository';
import { syncPublicationWork } from '../miniprogram/publication/sync';
import { fitCrop, moveCrop } from '../miniprogram/publication/crop';
import { publicationBytes } from '../miniprogram/publication/binary';

class Images extends MemoryFileSystem implements PublicationFiles {
  async readBinary(path: string) { return Uint8Array.from(JSON.parse(await this.readText(path)) as number[]).buffer; }
  async writeBinary(path: string, data: ArrayBuffer) { await this.writeText(path, JSON.stringify([...new Uint8Array(data)])); }
  async copy(from: string, to: string) { await this.writeText(to, await this.readText(from)); }
}
const preview: PublicationPreview = { articleId: 'article-1', assetId: 'cropped-1', title: '旧时光', body: '确认正文', authorName: '岁月作者000001', aiAssisted: false,
  workVersion: 1, settingsVersion: 1, version: 0 };
function setup() {
  const files = new Images(), storage = new MiniPublicationStorage(files, '/account-a');
  files.set('/temp-photo', '[1,2,3]');
  const client = { upload: vi.fn(async () => ({ assetId: 'asset-1', width: 640, height: 480, crops: centeredCrops(640, 480) })),
    settings: vi.fn(async () => ({ assetId: 'cropped-1', settingsVersion: 1 })), preview: vi.fn(async () => preview),
    submit: vi.fn(async () => ({ articleId: 'article-1', submissionId: 'submission-1', version: 1 })),
    action: vi.fn(async () => ({ version: 2 })), ownImage: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer) };
  const sync = vi.fn(async () => {}), assertActive = vi.fn();
  const controller = new MiniPublicationController('work-1', storage, client as unknown as MiniPublicationClient, sync, assertActive);
  const ready = async () => { await controller.choose('/temp-photo', 640, 480); await controller.confirmCrop('thumbnail'); await controller.confirmCrop('reading'); await controller.finishCrop(); };
  return { files, storage, client, sync, assertActive, controller, ready };
}
describe('独立发表设置与固定操作重试', () => {
  it('等待中的同步只确认旧修订时不能发表，最新修订确认后才返回云版本', async () => {
    const repository = new MiniWorkRepository(new MemoryFileSystem(), '/account-a', undefined, 'account-a');
    const draft = { ...emptyDraft(), title: '文章', inputMode: 'text' as const, textDraft: '旧正文' };
    await repository.save(draft, 0);
    const old = (await repository.queueMutation(draft.id))!;
    await repository.save({ ...draft, textDraft: '新正文' }, 1);
    const acknowledge = (operationId: string, version: number) => repository.acknowledge(draft.id, { operationId,
      entry: { id: draft.id, version, sequence: version, title: '', updatedAt: draft.updatedAt, deletedAt: null, purged: false } });
    await expect(syncPublicationWork(draft.id, repository, () => acknowledge(old.operationId, 1))).rejects.toThrow('最新正文尚未同步');
    const current = (await repository.queueMutation(draft.id))!;
    await expect(syncPublicationWork(draft.id, repository, () => acknowledge(current.operationId, 2))).resolves.toBe(2);
  });

  it('已确认的云版本与预览不符时不会创建投稿操作或提交', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare();
    const controller = new MiniPublicationController('work-1', s.storage, s.client as unknown as MiniPublicationClient, async () => 2, s.assertActive);
    await expect(controller.prepare()).rejects.toThrow('正文已有变化');
    await expect(controller.submit(preview)).rejects.toThrow('正文已有变化');
    expect(s.client.submit).not.toHaveBeenCalled(); expect((await controller.local()).submissionOperation).toBeNull();
  });

  it('微信跨上下文的 ArrayBuffer 可以读取并转换为可上传的本地缓冲区', () => {
    const value = runInNewContext('Uint8Array.from([1, 2, 3]).buffer');
    expect(value instanceof ArrayBuffer).toBe(false);
    const bytes = publicationBytes(value);
    expect(bytes instanceof ArrayBuffer).toBe(true); expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
    expect(() => publicationBytes('invalid')).toThrow('图片读取失败');
    expect(() => publicationBytes(new ArrayBuffer(8 * 1024 * 1024 + 1))).toThrow('8MB');
  });
  it('复制封面后才保存设置；取消或本机写入失败保留旧封面，重启与账号隔离可恢复', async () => {
    const s = setup(); await s.ready();
    const saved = await s.controller.local();
    expect(saved.path).toMatch(/^\/account-a\/publication\//);
    s.files.set('/temp-photo', '[9]');
    expect([...new Uint8Array(await s.files.readBinary(saved.path))]).toEqual([1, 2, 3]);
    s.files.failOnce('rename', new Error('磁盘异常'));
    await expect(s.controller.choose('/temp-photo', 100, 100)).rejects.toThrow('磁盘异常');
    expect(await new MiniPublicationStorage(s.files, '/account-a').load('work-1')).toEqual(saved);
    expect((await new MiniPublicationStorage(s.files, '/account-b').load('work-1')).path).toBe('');
  });
  it('两种裁切独立确认，改变一种只取消该种确认，未确认不会上传', async () => {
    const s = setup(); await s.ready();
    const saved = await s.controller.local();
    await s.controller.crop({ ...saved.crops!, thumbnail: fitCrop(640, 480, 1, 2, saved.crops!.thumbnail) });
    expect((await s.controller.local()).confirmed).toEqual(['reading']);
    await expect(s.controller.prepare()).rejects.toThrow('分别确认'); expect(s.client.upload).not.toHaveBeenCalled();
    await s.controller.confirmCrop('thumbnail'); await expect(s.controller.prepare()).resolves.toEqual(preview);
    expect(s.sync).toHaveBeenCalledTimes(2);
  });
  it('上传或设置响应丢失时跨重启重试原 ID，保留图片和裁切', async () => {
    const s = setup(); await s.ready();
    s.client.upload.mockRejectedValueOnce(new Error('网络中断'));
    await expect(s.controller.prepare()).rejects.toThrow('网络中断');
    const uploadId = (await s.controller.local()).uploadId;
    s.client.settings.mockRejectedValueOnce(new Error('响应丢失'));
    await expect(s.controller.prepare()).rejects.toThrow('响应丢失');
    const pending = (await s.controller.local()).settingOperation;
    const restored = new MiniPublicationController('work-1', new MiniPublicationStorage(s.files, '/account-a'), s.client as unknown as MiniPublicationClient, s.sync, s.assertActive);
    await restored.prepare();
    expect(s.client.upload.mock.calls[0]).toEqual(s.client.upload.mock.calls[1]);
    expect(uploadId).toBeTruthy(); expect(s.client.settings.mock.calls[0]).toEqual(s.client.settings.mock.calls[1]);
    expect(pending?.operationId).toBeTruthy(); expect((await restored.local()).settingOperation).toBeNull();
  });
  it('投稿先同步，结果不明保留回执 ID，冲突才要求重新预览；改名使用新署名', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare();
    s.client.submit.mockRejectedValueOnce(new Error('响应丢失'));
    await expect(s.controller.submit(preview)).rejects.toThrow('响应丢失');
    const pending = (await s.controller.local()).submissionOperation;
    await expect(s.controller.choose('/temp-photo', 100, 100)).rejects.toThrow('先重试');
    await s.controller.submit(null);
    expect(s.client.submit.mock.calls[0]).toEqual(s.client.submit.mock.calls[1]);
    expect(pending?.authorName).toBe(preview.authorName); expect(s.sync).toHaveBeenCalledTimes(2);
    s.client.submit.mockRejectedValueOnce(Object.assign(new Error('内容变化'), { status: 409 }));
    await expect(s.controller.submit({ ...preview, authorName: '新的署名' })).rejects.toThrow('内容变化');
    expect((await s.controller.local()).submissionOperation).toBeNull();
    expect(s.client.submit).toHaveBeenLastCalledWith('work-1', expect.objectContaining({ authorName: '新的署名' }));
  });
  it('账号接管时不写入迟到的上传结果；新封面尺寸从实际文件重新读取', async () => {
    const s = setup(); await s.ready();
    s.client.upload.mockImplementationOnce(async () => { s.assertActive.mockImplementation(() => { throw new Error('账号变化'); }); return { assetId: 'late', width: 100, height: 100, crops: centeredCrops(100, 100) }; });
    await expect(s.controller.prepare()).rejects.toThrow('账号变化');
    expect((await s.controller.local()).assetId).toBeNull();
    s.assertActive.mockReset();
    await s.controller.useRemote({ settings: { version: 2, assetId: 'remote', crops: centeredCrops(200, 400) } } as PublicationStatus);
    expect(await s.controller.local()).toMatchObject({ width: 0, height: 0, settingsVersion: 2 });
  });
  it('正文同步失败时不会发送投稿，原预览保留以便明确重试', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare(); s.sync.mockRejectedValueOnce(new Error('正文未同步'));
    await expect(s.controller.submit(preview)).rejects.toThrow('正文未同步');
    expect(s.client.submit).not.toHaveBeenCalled(); expect((await s.controller.local()).submissionOperation).toBeNull();
  });
  it('裁切取消恢复原封面，未完成进度在重启后可继续且不会提前上传', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare(); const before = await s.controller.local();
    await s.controller.choose('/temp-photo', 320, 480); await s.controller.confirmCrop('reading');
    const resumed = new MiniPublicationController('work-1', new MiniPublicationStorage(s.files, '/account-a'), s.client as unknown as MiniPublicationClient, s.sync, s.assertActive);
    expect(await resumed.local()).toMatchObject({ width: 320, confirmed: ['reading'], cropBackup: { path: before.path } });
    await expect(resumed.prepare()).rejects.toThrow('完成封面裁切');
    await resumed.cancelCrop(); expect(await resumed.local()).toEqual(before);
    await resumed.beginCrop(); const crop = (await resumed.local()).crops!;
    await resumed.crop({ ...crop, reading: fitCrop(640, 480, 1.25, 2) });
    expect((await resumed.local()).confirmed).toEqual(['thumbnail']);
    await resumed.confirmCrop('reading'); await resumed.finishCrop();
    expect((await resumed.local()).cropBackup).toBeNull(); expect((await resumed.local()).confirmed).toHaveLength(2);
  });
  it('首次选图取消回到没有封面的同篇草稿；旧侧文件自动补裁切备份字段', async () => {
    const s = setup(); await s.controller.choose('/temp-photo', 100, 100); await s.controller.cancelCrop();
    expect(await s.controller.local()).toMatchObject({ workId: 'work-1', path: '', cropBackup: null });
    const path = s.storage.root + '/work-1.json'; const old = JSON.parse(await s.files.readText(path)); delete old.cropBackup;
    await s.files.writeText(path, JSON.stringify(old));
    expect((await new MiniPublicationStorage(s.files, '/account-a').load('work-1')).cropBackup).toBeNull();
  });
  it('平移缩放不会越界且两种比例保持精确', () => {
    for (const ratio of [1, 1.25]) for (const [width, height] of [[640, 480], [300, 900], [2048, 500]]) {
      const crop = fitCrop(width!, height!, ratio, 4);
      const moved = moveCrop(crop, 100, -100, 300, ratio);
      expect(moved.x + moved.width).toBeLessThanOrEqual(1); expect(moved.y).toBeGreaterThanOrEqual(0);
      expect(moved.width * width! / (moved.height * height!)).toBeCloseTo(ratio, 6);
    }
  });
});
