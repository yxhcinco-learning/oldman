import { z, cloudIdSchema, coverCropsSchema, submissionInputSchema, publicationSettingsInputSchema, publicationActionSchema, audienceInputSchema, newId } from '../domain/core';
import { WxLocalFileSystem, type LocalFileSystem } from '../storage/file-system';
import { publicationBytes } from './binary';

export interface PublicationFiles extends LocalFileSystem {
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, bytes: ArrayBuffer): Promise<void>;
  copy(from: string, to: string): Promise<void>;
}
export class WxPublicationFiles extends WxLocalFileSystem implements PublicationFiles {
  async readBinary(path: string) {
    const value = wx.getFileSystemManager().readFileSync(path);
    return publicationBytes(value);
  }
  async writeBinary(path: string, bytes: ArrayBuffer) { wx.getFileSystemManager().writeFileSync(path, bytes); }
  async copy(from: string, to: string) { wx.getFileSystemManager().copyFileSync(from, to); }
}
const coverStateSchema = z.object({ path: z.string().max(1024), width: z.number().nonnegative(), height: z.number().nonnegative(),
  crops: coverCropsSchema.nullable(), settingsVersion: z.number().int().nonnegative(), assetId: cloudIdSchema.nullable(),
  confirmed: z.array(z.enum(['thumbnail', 'reading'])).max(2), uploadId: cloudIdSchema.nullable(), dirty: z.boolean() });
export const publicationDraftSchema = z.object({
  version: z.literal(1), workId: cloudIdSchema, path: z.string().max(1024), width: z.number().nonnegative(), height: z.number().nonnegative(),
  crops: coverCropsSchema.nullable(), settingsVersion: z.number().int().nonnegative(), assetId: cloudIdSchema.nullable(),
  confirmed: z.array(z.enum(['thumbnail', 'reading'])).max(2).default([]),
  uploadId: cloudIdSchema.nullable(), dirty: z.boolean(),
  settingOperation: publicationSettingsInputSchema.nullable(), submissionOperation: submissionInputSchema.nullable(), actionOperation: publicationActionSchema.nullable(),
  cropBackup: coverStateSchema.nullable().default(null),
  audienceChoice: z.enum(['account', 'guest']).nullable().default(null),
  audienceOperation: audienceInputSchema.nullable().default(null),
}).strict();
export type PublicationDraft = z.infer<typeof publicationDraftSchema>;
export const emptyPublicationDraft = (workId: string): PublicationDraft => ({ version: 1, workId, path: '', width: 0, height: 0, crops: null,
  confirmed: [], settingsVersion: 0, assetId: null, uploadId: null, dirty: false, settingOperation: null, submissionOperation: null, actionOperation: null, cropBackup: null, audienceChoice: null, audienceOperation: null });

/** Independent of .work.json, scoped to the repository's verified account root. */
export class MiniPublicationStorage {
  private tail: Promise<unknown> = Promise.resolve();
  readonly root: string;
  constructor(readonly files: PublicationFiles, accountRoot: string) { this.root = accountRoot + '/publication'; }
  private queue<T>(action: () => Promise<T>): Promise<T> { const run = this.tail.catch(() => undefined).then(action); this.tail = run; return run; }
  flush() { return this.tail.then(() => undefined); }
  private path(id: string) { return this.root + '/' + cloudIdSchema.parse(id, { jitless: true }) + '.json'; }
  private parse(raw: string, id: string) {
    const value = publicationDraftSchema.parse(JSON.parse(raw), { jitless: true });
    if (value.workId !== id || value.path && (!value.path.startsWith(this.root + '/') || value.path.slice(this.root.length + 1).includes('/') || value.path.includes('..'))) throw new Error('发表设置无法读取，请保留现场后重试。');
    const previous = value.cropBackup?.path;
    if (previous && (!previous.startsWith(this.root + '/') || previous.slice(this.root.length + 1).includes('/') || previous.includes('..'))) throw new Error('原封面无法读取，请保留现场后重试。');
    return value;
  }
  async load(id: string): Promise<PublicationDraft> {
    return this.queue(async () => {
      const path = this.path(id);
      let found = false;
      for (const candidate of [path, path + '.bak', path + '.tmp']) {
        if (!await this.files.exists(candidate)) continue;
        found = true;
        try { return this.parse(await this.files.readText(candidate), id); } catch { /* Try the last atomic copy. */ }
      }
      if (found) throw new Error('发表设置无法读取，请重试；正文仍保留。');
      return emptyPublicationDraft(id);
    });
  }
  async save(draft: PublicationDraft) {
    const copy = this.parse(JSON.stringify(draft), draft.workId);
    return this.queue(async () => {
      await this.files.ensureDirectory(this.root);
      const path = this.path(copy.workId);
      await this.files.writeText(path + '.tmp', JSON.stringify(copy));
      this.parse(await this.files.readText(path + '.tmp'), copy.workId);
      if (await this.files.exists(path)) {
        // Keep a valid backup when the main file is damaged.
        let valid = false;
        try { this.parse(await this.files.readText(path), copy.workId); valid = true; } catch { /* Preserve the previous backup. */ }
        if (valid) {
          if (await this.files.exists(path + '.bak')) await this.files.remove(path + '.bak');
          await this.files.rename(path, path + '.bak');
        } else await this.files.rename(path, this.root + '/' + newId() + '.damaged');
      }
      await this.files.rename(path + '.tmp', path);
      return copy;
    });
  }
  async preserveImage(source: string) {
    return this.queue(async () => {
      await this.files.ensureDirectory(this.root);
      const target = this.root + '/' + newId() + '.jpg';
      await this.files.copy(source, target);
      const bytes = await this.files.readBinary(target);
      if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
        await this.files.remove(target); throw new Error('请选择 8MB 以内的图片。');
      }
      return target;
    });
  }
  async cacheImage(key: string, data: ArrayBuffer) {
    return this.queue(async () => {
      cloudIdSchema.parse(key, { jitless: true });
      const bytes = publicationBytes(data);
      await this.files.ensureDirectory(this.root);
      const path = this.root + '/' + key + '.jpg', temp = this.root + '/' + newId() + '.tmp';
      await this.files.writeBinary(temp, bytes);
      if (await this.files.exists(path)) await this.files.remove(path);
      await this.files.rename(temp, path);
      return path;
    });
  }
}
