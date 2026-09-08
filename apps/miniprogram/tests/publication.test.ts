import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { MemoryFileSystem } from './memory-file-system';
import { MiniPublicationStorage, type PublicationFiles } from '../miniprogram/publication/storage';
import { MiniPublicationController } from '../miniprogram/publication/controller';
import { MiniPublicationClient } from '../miniprogram/publication/client';
import { centeredCrops, emptyDraft, type PublicationPreview, type PublicationStatus } from '../miniprogram/domain/core';
import { MiniWorkRepository } from '../miniprogram/storage/repository';
import { syncPublicationWork } from '../miniprogram/publication/sync';
import { compositionCrops, fitCrop, moveCrop } from '../miniprogram/publication/crop';
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
  const ready = async () => { await controller.choose('/temp-photo', 640, 480); await controller.finishCrop(); };
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
    await expect(controller.submit(preview.authorName)).rejects.toThrow('正文已有变化');
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
  it('一份构图同时生成两种比例，点击一次完成才可上传', async () => {
    const s = setup(); await s.ready();
    await s.controller.beginCrop();
    const reading = fitCrop(640, 480, 1.25, 2, { x: .75, y: .25 });
    await s.controller.compose(reading);
    expect((await s.controller.local()).crops).toEqual(compositionCrops(reading));
    expect((await s.controller.local()).confirmed).toEqual([]);
    await expect(s.controller.prepare()).rejects.toThrow('完成封面裁切'); expect(s.client.upload).not.toHaveBeenCalled();
    await s.controller.finishCrop(); await expect(s.controller.prepare()).resolves.toEqual(preview);
    expect(s.sync).toHaveBeenCalledTimes(2);
  });
  it('旧独立裁切在读取和投稿时原样保留，进入调整才联动，取消还原旧两图', async () => {
    const s = setup(); await s.ready(); const original = await s.controller.local();
    const crops = { reading: fitCrop(640, 480, 1.25, 2, { x: .7, y: .3 }), thumbnail: fitCrop(640, 480, 1, 3, { x: .2, y: .8 }) };
    await s.storage.save({ ...original, crops });
    await s.controller.prepare();
    expect(s.client.settings).toHaveBeenCalledWith('work-1', expect.objectContaining({ crops }));
    const baseline = await s.controller.local(); expect(baseline.crops).toEqual(crops);
    await s.controller.beginCrop();
    expect((await s.controller.local()).crops).toEqual(compositionCrops(crops.reading));
    await s.controller.compose(fitCrop(640, 480, 1.25));
    await s.controller.cancelCrop(); expect(await s.controller.local()).toEqual(baseline);
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
  it('投稿内部准备当前快照，结果不明原样重试，明确冲突后可直接重新投稿', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare();
    s.client.submit.mockRejectedValueOnce(new Error('响应丢失'));
    await expect(s.controller.submit(preview.authorName)).rejects.toThrow('响应丢失');
    const pending = (await s.controller.local()).submissionOperation;
    await expect(s.controller.choose('/temp-photo', 100, 100)).rejects.toThrow('先重试');
    await s.controller.submit();
    expect(s.client.submit.mock.calls[0]).toEqual(s.client.submit.mock.calls[1]);
    expect(pending?.authorName).toBe(preview.authorName); expect(s.sync).toHaveBeenCalledTimes(2);
    s.client.submit.mockRejectedValueOnce(Object.assign(new Error('内容变化'), { status: 409 }));
    s.client.preview.mockResolvedValueOnce({ ...preview, authorName: '新的署名' });
    await expect(s.controller.submit('新的署名')).rejects.toThrow('内容变化');
    expect((await s.controller.local()).submissionOperation).toBeNull();
    expect(s.client.submit).toHaveBeenLastCalledWith('work-1', expect.objectContaining({ authorName: '新的署名' }));
  });
  it('没有打开阅读预览也可提交，正文同步和封面设置先完成再固定投稿操作', async () => {
    const s = setup(); await s.ready();
    await s.controller.submit(preview.authorName);
    expect(s.sync).toHaveBeenCalledTimes(1); expect(s.client.preview).toHaveBeenCalledTimes(1);
    expect(s.client.upload).toHaveBeenCalledTimes(1); expect(s.client.settings).toHaveBeenCalledTimes(1);
    expect(s.client.submit).toHaveBeenCalledWith('work-1', expect.objectContaining({ workVersion: 1, settingsVersion: 1, authorName: preview.authorName }));
    expect(s.client.settings.mock.invocationCallOrder[0]).toBeLessThan(s.client.submit.mock.invocationCallOrder[0]!);
    expect(await s.controller.local()).toMatchObject({ dirty: false, submissionOperation: null, settingOperation: null });
  });
  it('预览之后改正文和署名，直接投稿使用新版本，旧预览不能决定提交内容', async () => {
    const s = setup(); await s.ready();
    const old = await s.controller.prepare();
    s.client.preview.mockResolvedValueOnce({ ...preview, title: '新标题', body: '新正文', authorName: '新署名', workVersion: 2 });
    const controller = new MiniPublicationController('work-1', s.storage, s.client as unknown as MiniPublicationClient, async () => 2, s.assertActive);
    await controller.submit('新署名');
    expect(old).toEqual(preview);
    expect(s.client.submit).toHaveBeenCalledWith('work-1', expect.objectContaining({ workVersion: 2, authorName: '新署名' }));
  });
  it('投稿响应丢失后跨重启先确认原操作，不因正文或名字变化准备第二份投稿', async () => {
    const s = setup(); await s.ready();
    s.client.submit.mockRejectedValueOnce(new Error('响应丢失'));
    await expect(s.controller.submit()).rejects.toThrow('响应丢失');
    const pending = (await s.controller.local()).submissionOperation;
    const sync = vi.fn(async () => { throw new Error('不能同步改稿'); });
    s.client.preview.mockImplementationOnce(async () => { throw new Error('不能准备新稿'); });
    const restored = new MiniPublicationController('work-1', new MiniPublicationStorage(s.files, '/account-a'), s.client as unknown as MiniPublicationClient, sync, s.assertActive);
    await restored.submit('改后的名字');
    expect(sync).not.toHaveBeenCalled(); expect(s.client.preview).toHaveBeenCalledTimes(1);
    expect(s.client.submit).toHaveBeenLastCalledWith('work-1', pending);
    expect(s.client.submit.mock.calls[0]).toEqual(s.client.submit.mock.calls[1]);
  });
  it('缺封面、未看到的新署名和远端封面变化都不生成投稿操作', async () => {
    const s = setup(); await expect(s.controller.submit()).rejects.toThrow('添加文章封面');
    await s.ready();
    await expect(s.controller.submit('未展示的新署名')).rejects.toThrow('署名已更新');
    s.client.preview.mockResolvedValueOnce({ ...preview, settingsVersion: 2, assetId: 'remote-cover' });
    await expect(s.controller.submit()).rejects.toThrow('封面设置已变化');
    expect(s.client.submit).not.toHaveBeenCalled(); expect((await s.controller.local()).submissionOperation).toBeNull();
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
  it('正文同步失败时不会发送投稿，正文及封面保留以便重试', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare(); s.sync.mockRejectedValueOnce(new Error('正文未同步'));
    await expect(s.controller.submit(preview.authorName)).rejects.toThrow('正文未同步');
    expect(s.client.submit).not.toHaveBeenCalled(); expect((await s.controller.local()).submissionOperation).toBeNull();
  });
  it('裁切取消恢复原封面，未完成进度在重启后可继续且不会提前上传', async () => {
    const s = setup(); await s.ready(); await s.controller.prepare(); const before = await s.controller.local();
    await s.controller.choose('/temp-photo', 320, 480);
    const reading = fitCrop(320, 480, 1.25, 2); await s.controller.compose(reading);
    const resumed = new MiniPublicationController('work-1', new MiniPublicationStorage(s.files, '/account-a'), s.client as unknown as MiniPublicationClient, s.sync, s.assertActive);
    expect(await resumed.local()).toMatchObject({ width: 320, crops: compositionCrops(reading), confirmed: [], cropBackup: { path: before.path } });
    await resumed.beginCrop(); expect((await resumed.local()).crops).toEqual(compositionCrops(reading));
    await expect(resumed.prepare()).rejects.toThrow('完成封面裁切');
    await resumed.cancelCrop(); expect(await resumed.local()).toEqual(before);
    await resumed.beginCrop();
    await resumed.compose(fitCrop(640, 480, 1.25, 2));
    expect((await resumed.local()).confirmed).toEqual([]);
    await resumed.finishCrop();
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
  it('共同构图的方图始终是阅读图正中间，移动缩放不会额外偏移', () => {
    for (const [width, height] of [[640, 480], [300, 900], [2048, 500]]) {
      const reading = moveCrop(fitCrop(width!, height!, 1.25, 2), 60, -80, 280, 1.25);
      const { thumbnail } = compositionCrops(reading);
      expect(thumbnail.x + thumbnail.width / 2).toBeCloseTo(reading.x + reading.width / 2);
      expect(thumbnail.y).toBe(reading.y); expect(thumbnail.height).toBe(reading.height);
      expect(thumbnail.width * width! / (thumbnail.height * height!)).toBeCloseTo(1, 8);
    }
  });
});
