import { articleText, effectiveSegments, externalArticleText, parseBackupBundle, type ArticleSession, type Draft, type WritingState } from '../domain/core';
import type { MiniWorkRepository } from '../storage/repository';
import type { LocalFileSystem } from '../storage/file-system';

export interface BackupFilePlatform {
  chooseJsonFile(): Promise<{ name: string; path: string } | null>;
  shareFile(path: string, name: string): Promise<void>;
  copyText(value: string): Promise<void>;
}

export class WxBackupFilePlatform implements BackupFilePlatform {
  chooseJsonFile() {
    return new Promise<{ name: string; path: string } | null>((resolve, reject) => wx.chooseMessageFile({ count: 1, type: 'file',
      extension: ['json'], success: result => {
        const file = result.tempFiles[0];
        resolve(file ? { name: file.name, path: file.path } : null);
      }, fail: error => {
        if (/cancel/i.test(error.errMsg)) resolve(null);
        else reject(error);
      } }));
  }

  shareFile(path: string, name: string) {
    return new Promise<void>((resolve, reject) => wx.shareFileMessage({ filePath: path, fileName: name, success: () => resolve(), fail: reject }));
  }

  copyText(value: string) {
    return new Promise<void>((resolve, reject) => wx.setClipboardData({ data: value, success: () => resolve(), fail: reject }));
  }
}

function exportName(extension: 'json' | 'txt', now: Date) {
  const stamp = now.toISOString().slice(0, 19).replaceAll(':', '-');
  return `岁月有声-${extension === 'json' ? '备份' : '文章'}-${stamp}.${extension}`;
}

export class MiniBackupController {
  constructor(private readonly repository: MiniWorkRepository, private readonly files: LocalFileSystem,
    private readonly platform: BackupFilePlatform, private readonly now = () => new Date()) {}

  private async writeAndShare(raw: string, name: string) {
    const path = `${this.repository.paths.root}/${name}`;
    await this.files.writeText(path, raw);
    if (await this.files.readText(path) !== raw) throw new Error('导出文件校验失败，请重试');
    await this.platform.shareFile(path, name);
    return path;
  }

  async exportAll() {
    const volumes = await this.repository.exportVolumes();
    let path = '';
    for (let index = 0; index < volumes.length; index++) {
      const raw = volumes[index]!;
      parseBackupBundle(raw);
      const name = exportName('json', this.now()).replace('.json', volumes.length > 1 ? `-第${index + 1}卷-共${volumes.length}卷.json` : '.json');
      path = await this.writeAndShare(raw, name);
    }
    return path;
  }

  async rescue(draft: Draft, session?: ArticleSession | null, writingState?: WritingState) {
    const state = writingState ?? (await this.repository.getAggregate(draft.id))?.writingState;
    const raw = this.repository.rescueExport(draft, [], session ? [session] : [], state ? [{ workId: draft.id, state }] : []);
    parseBackupBundle(raw);
    return this.writeAndShare(raw, `岁月有声-救援-${exportName('json', this.now()).replace('岁月有声-备份-', '')}`);
  }

  async chooseAndImport() {
    const selected = await this.platform.chooseJsonFile();
    if (!selected) return 0;
    const raw = await this.files.readText(selected.path);
    parseBackupBundle(raw);
    return this.repository.importBackup(raw);
  }

  async exportText(draft: Draft, session?: ArticleSession | null) {
    const body = articleText(effectiveSegments(draft));
    const raw = `${draft.title.trim() || '未命名作品'}\n\n${externalArticleText(body, session)}`.trimEnd();
    return this.writeAndShare(raw, exportName('txt', this.now()));
  }

  async copyBody(draft: Draft, session?: ArticleSession | null) {
    await this.platform.copyText(externalArticleText(articleText(effectiveSegments(draft)), session));
  }
}
