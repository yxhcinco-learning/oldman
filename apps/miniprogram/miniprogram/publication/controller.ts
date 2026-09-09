import { newId, centeredCrops, type CoverCrops, type PublicationPreview, type PublicationStatus } from '../domain/core';
import { MiniPublicationClient } from './client';
import { MiniPublicationStorage, type PublicationDraft } from './storage';
import { compositionCrops, type Crop } from './crop';

export class MiniPublicationController {
  constructor(readonly workId: string, readonly storage: MiniPublicationStorage, readonly client: MiniPublicationClient,
    private readonly sync: () => Promise<number | void>, private readonly assertActive: () => void) {}
  async local() { return this.storage.load(this.workId); }
  private async save(draft: PublicationDraft) { this.assertActive(); return this.storage.save(draft); }
  private coverState(draft: PublicationDraft) {
    const { path, width, height, crops, settingsVersion, assetId, confirmed, uploadId, dirty } = draft;
    return { path, width, height, crops, settingsVersion, assetId, confirmed, uploadId, dirty };
  }
  async beginCrop() {
    const draft = await this.local();
    if (draft.settingOperation || draft.submissionOperation || draft.actionOperation) throw new Error('请先重试上次操作。');
    if (!draft.path || !draft.crops) throw new Error('请先添加文章封面。');
    // Only entering the adjustment flow links old independently cropped images.
    await this.save({ ...draft, cropBackup: draft.cropBackup ?? this.coverState(draft),
      crops: compositionCrops(draft.crops.reading), confirmed: [], dirty: true });
  }
  async cancelCrop() {
    const draft = await this.local();
    if (draft.settingOperation || draft.submissionOperation || draft.actionOperation) throw new Error('请先确认上次操作。');
    if (draft.cropBackup) await this.save({ ...draft, ...draft.cropBackup, cropBackup: null });
  }
  async finishCrop() {
    const draft = await this.local();
    if (!draft.path || !draft.crops || !draft.cropBackup || draft.settingOperation || draft.submissionOperation || draft.actionOperation) throw new Error('请先完成当前操作。');
    await this.save({ ...draft, crops: compositionCrops(draft.crops.reading), confirmed: ['thumbnail', 'reading'], dirty: true, cropBackup: null });
  }
  async choose(source: string, width: number, height: number) {
    const current = await this.local();
    if (current.settingOperation || current.submissionOperation || current.actionOperation) throw new Error('请先重试上次操作，再更换封面。');
    const path = await this.storage.preserveImage(source);
    this.assertActive();
    return this.save({ ...current, cropBackup: current.cropBackup ?? this.coverState(current), path, width, height, crops: compositionCrops(centeredCrops(width, height).reading), confirmed: [], assetId: null, uploadId: newId(), dirty: true });
  }
  async compose(reading: Crop) {
    const current = await this.local();
    if (!current.cropBackup || current.settingOperation || current.submissionOperation || current.actionOperation) throw new Error('请先打开封面调整。');
    return this.save({ ...current, crops: compositionCrops(reading), confirmed: [], dirty: true });
  }
  async crop(crops: CoverCrops) {
    const current = await this.local();
    if (current.settingOperation || current.submissionOperation || current.actionOperation) throw new Error('请先重试上次操作，再调整封面。');
    return this.save({ ...current, crops, confirmed: current.confirmed.filter(kind => JSON.stringify(current.crops?.[kind]) === JSON.stringify(crops[kind])), dirty: true });
  }
  async confirmCrop(kind: 'thumbnail' | 'reading') {
    const draft = await this.local();
    if (!draft.crops || draft.settingOperation || draft.submissionOperation || draft.actionOperation) throw new Error('请先完成当前操作。');
    return this.save({ ...draft, confirmed: [...new Set([...draft.confirmed, kind])] });
  }
  async useRemote(status: PublicationStatus) {
    let current = await this.local();
    if (current.submissionOperation || current.settingOperation || current.actionOperation) throw new Error('请先重试上次操作。');
    let path = '';
    const width = 0, height = 0;
    if (status.settings.assetId) {
      const data = await this.client.ownImage(this.workId, status.settings.assetId, 'master');
      this.assertActive();
      path = await this.storage.cacheImage('master-' + status.settings.assetId, data);
      // The page supplies actual image dimensions before editing the crop.
    }
    current = { ...current, path, width, height, assetId: status.settings.assetId, settingsVersion: status.settings.version,
      crops: status.settings.crops, confirmed: status.settings.assetId ? ['thumbnail', 'reading'] : [], dirty: false, uploadId: null, cropBackup: null };
    return this.save(current);
  }
  async dimensions(width: number, height: number) { return this.save({ ...await this.local(), width, height }); }
  async prepare(): Promise<PublicationPreview> {
    const workVersion = await this.sync(); this.assertActive();
    let draft = await this.local();
    if (draft.cropBackup) throw new Error('请先完成封面裁切。');
    if (draft.actionOperation || draft.submissionOperation) throw new Error('上次发表操作尚未确认，请先重试。');
    if (!draft.path || !draft.crops) throw new Error('请先添加文章封面。');
    if (draft.dirty && draft.confirmed.length !== 2) throw new Error('请先完成封面调整。');
    if (draft.dirty || draft.settingOperation) {
      if (!draft.path || !draft.crops) throw new Error('请先选择文章封面。');
      if (!draft.assetId || draft.uploadId) {
        draft = { ...draft, uploadId: draft.uploadId ?? newId() };
        await this.save(draft);
        const image = await this.storage.files.readBinary(draft.path);
        const uploaded = await this.client.upload(this.workId, draft.uploadId!, image);
        this.assertActive();
        draft = { ...draft, assetId: uploaded.assetId, uploadId: null, width: uploaded.width, height: uploaded.height };
        await this.save(draft);
      }
      draft = { ...draft, settingOperation: draft.settingOperation ?? { operationId: newId(), expectedVersion: draft.settingsVersion, assetId: draft.assetId!, crops: draft.crops! } };
      await this.save(draft);
      const saved = await this.client.settings(this.workId, draft.settingOperation!);
      this.assertActive();
      draft = { ...draft, assetId: saved.assetId, settingsVersion: saved.settingsVersion, settingOperation: null, dirty: false };
      await this.save(draft);
    }
    const preview = await this.client.preview(this.workId);
    this.assertActive();
    if (workVersion !== undefined && workVersion !== preview.workVersion) throw new Error('正文已有变化，请重试。');
    if (preview.settingsVersion !== draft.settingsVersion || preview.assetId !== draft.assetId) throw new Error('封面设置已变化，请刷新后重试。');
    return preview;
  }
  async submit(authorName?: string) {
    let draft = await this.local();
    this.assertActive();
    if (!draft.submissionOperation) {
      // Preparation is part of submission. A reading preview is optional and never supplies the submitted content.
      const preview = await this.prepare();
      this.assertActive();
      if (authorName !== undefined && authorName !== preview.authorName) throw new Error('署名已更新，请刷新后再提交。');
      draft = await this.local();
      draft = { ...draft, submissionOperation: { operationId: newId(), expectedVersion: preview.version, workVersion: preview.workVersion,
        settingsVersion: preview.settingsVersion, authorName: preview.authorName } };
      await this.save(draft);
    }
    try {
      const result = await this.client.submit(this.workId, draft.submissionOperation!);
      this.assertActive();
      await this.save({ ...draft, submissionOperation: null });
      return result;
    } catch (error) {
      // Definitive conflicts did not commit. An unknown network outcome retains the fixed operation for retry.
      if ((error as { status?: number }).status === 409) await this.save({ ...draft, submissionOperation: null });
      throw error;
    }
  }
  async withdraw(status: PublicationStatus, action: 'withdraw' | 'withdraw-review') {
    let draft = await this.local();
    if (draft.submissionOperation) throw new Error('请先确认上次投稿结果。');
    draft = { ...draft, actionOperation: draft.actionOperation ?? { operationId: newId(), expectedVersion: status.version, action, reason: '' } };
    await this.save(draft);
    try {
      const result = await this.client.action(this.workId, draft.actionOperation!);
      this.assertActive(); await this.save({ ...draft, actionOperation: null }); return result;
    } catch (error) {
      if ((error as { status?: number }).status === 409) await this.save({ ...draft, actionOperation: null });
      throw error;
    }
  }
}
