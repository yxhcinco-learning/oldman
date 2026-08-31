import { describe, expect, it } from 'vitest';
import { MiniBackupController, type BackupFilePlatform } from '../miniprogram/backup/file-transfer';
import { completeVoice, emptyDraft, makeBackup, parseBackupBundle, workFromDraft } from '../miniprogram/domain/core';
import { MiniWorkRepository } from '../miniprogram/storage/repository';
import { MemoryFileSystem } from './memory-file-system';

class FakePlatform implements BackupFilePlatform {
  selected: { name: string; path: string } | null = null;
  shared: Array<{ path: string; name: string }> = [];
  copied = '';
  async chooseJsonFile() { return this.selected; }
  async shareFile(path: string, name: string) { this.shared.push({ path, name }); }
  async copyText(value: string) { this.copied = value; }
}

describe('小程序手工备份与文件交接', () => {
  it('校验后分享兼容 JSON，并导入为独立副本', async () => {
    const files = new MemoryFileSystem();
    const platform = new FakePlatform();
    const repository = new MiniWorkRepository(files, '/user', () => new Date('2026-09-01T12:30:00Z'));
    const draft = completeVoice({ ...emptyDraft(), title: '往事', pendingVoice: '那年秋天。' });
    await repository.save(draft, 0);
    const controller = new MiniBackupController(repository, files, platform, () => new Date('2026-09-01T12:30:00Z'));
    const path = await controller.exportAll();
    expect(platform.shared[0]).toEqual({ path, name: '岁月有声-备份-2026-09-01T12-30-00.json' });
    expect(parseBackupBundle(files.files.get(path)!).works).toHaveLength(1);

    const importFiles = new MemoryFileSystem();
    const importedRepository = new MiniWorkRepository(importFiles, '/other');
    await importedRepository.load();
    importFiles.set('/temp/from-web.json', files.files.get(path)!);
    platform.selected = { name: 'from-web.json', path: '/temp/from-web.json' };
    const importer = new MiniBackupController(importedRepository, importFiles, platform);
    expect(await importer.chooseAndImport()).toBe(1);
    const imported = (await importedRepository.load()).works[0]!;
    expect(imported.id).not.toBe(draft.id);
    expect(imported.draft.segments[0]?.text).toBe('那年秋天。');
  });

  it('提供 TXT、复制和包含未完成输入的救援导出', async () => {
    const files = new MemoryFileSystem();
    const platform = new FakePlatform();
    const repository = new MiniWorkRepository(files, '/user');
    await repository.load();
    const draft = { ...emptyDraft(), title: '手记', inputMode: 'text' as const, textDraft: '第一段\n\n第二段', pendingVoice: '待确认语音' };
    const controller = new MiniBackupController(repository, files, platform, () => new Date('2026-09-01T00:00:00Z'));
    await controller.copyBody(draft);
    expect(platform.copied).toBe('第一段\n\n第二段');
    const txt = await controller.exportText(draft);
    expect(files.files.get(txt)).toBe('手记\n\n第一段\n\n第二段');
    const rescue = await controller.rescue(draft);
    expect(parseBackupBundle(files.files.get(rescue)!).works[0]?.draft.pendingVoice).toBe('待确认语音');
  });

  it('拒绝无效导入且不改变已有作品', async () => {
    const files = new MemoryFileSystem();
    const platform = new FakePlatform();
    const repository = new MiniWorkRepository(files, '/user');
    const original = workFromDraft(completeVoice({ ...emptyDraft(), pendingVoice: '原文' }));
    await repository.importBackup(makeBackup([original]));
    files.set('/temp/broken.json', '{broken');
    platform.selected = { name: 'broken.json', path: '/temp/broken.json' };
    const controller = new MiniBackupController(repository, files, platform);
    await expect(controller.chooseAndImport()).rejects.toThrow('JSON');
    expect((await repository.load()).works).toHaveLength(1);
  });
});
