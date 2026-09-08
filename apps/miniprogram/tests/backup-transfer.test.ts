import { describe, expect, it } from 'vitest';
import { MiniBackupController, type BackupFilePlatform } from '../miniprogram/backup/file-transfer';
import { AI_ASSISTANCE_DISCLOSURE, completeVoice, emptyDraft, makeBackup, newSession, newVersion, parseBackupBundle, startInterview, workFromDraft } from '../miniprogram/domain/core';
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

  it('提供 TXT、复制和正文救援导出，待确认语音仅留在当前内存', async () => {
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
    const restored = parseBackupBundle(files.files.get(rescue)!);
    expect(restored.works[0]?.draft).toMatchObject({ textDraft: draft.textDraft, pendingVoice: '', segmentEdit: null });
    expect(files.files.get(rescue)).not.toContain('待确认语音');
    expect(draft.pendingVoice).toBe('待确认语音');
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

  it('已应用候选的 TXT 和复制正文都带可见 AI 辅助说明', async () => {
    const files = new MemoryFileSystem();
    const platform = new FakePlatform();
    const repository = new MiniWorkRepository(files, '/user');
    await repository.load();
    const draft = { ...emptyDraft(), title: '整理稿', inputMode: 'text' as const, textDraft: '整理后的正文' };
    const session = newSession({ ...draft, textDraft: '用户原文' });
    const version = newVersion(draft, 'rewrite');
    session.versions.push(version);
    session.turns.push({ id: 'applied', createdAt: new Date().toISOString(), action: 'chat', prompt: '整理', inputVersionId: session.versions[0].id,
      status: 'applied', appliedVersionId: version.id, result: { answer: '已整理', body: draft.textDraft, citedVersionIds: [] } });
    const controller = new MiniBackupController(repository, files, platform, () => new Date('2026-09-01T00:00:00Z'));
    await controller.copyBody(draft, session);
    expect(platform.copied).toContain(AI_ASSISTANCE_DISCLOSURE);
    const txt = await controller.exportText(draft, session);
    expect(files.files.get(txt)).toContain(AI_ASSISTANCE_DISCLOSURE);
  });

  it('救援已清空的已有文章时仍导出同一作品，保留当前空值与静态会话', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/rescue-existing');
    const original = { ...emptyDraft(), title: '后来重写', inputMode: 'text' as const, textDraft: '原来的正文。' };
    const saved = (await repository.save(original, 0))!;
    const current = { ...emptyDraft(), id: original.id };
    const session = startInterview(newSession(current), current, 'open');
    await repository.save(current, saved.revision, session);
    const controller = new MiniBackupController(repository, files, new FakePlatform());
    const path = await controller.rescue(current, session, { composer: '', inputSource: 'typed' });
    const restored = parseBackupBundle(await files.readText(path));
    expect(restored.works).toHaveLength(1);
    expect(restored.works[0]).toMatchObject({ id: current.id, segments: [], draft: current });
    expect(restored.sessions).toEqual([session]);
  });

  it('救援优先采用传入的当前会话，未传时保留已存会话且均不导出输入框', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/rescue-current');
    const draft = { ...emptyDraft(), title: '手记' };
    const storedSession = newSession(draft), storedState = { composer: '先前未发送输入', inputSource: 'typed' as const };
    await repository.save(draft, 0, storedSession, storedState);
    const controller = new MiniBackupController(repository, files, new FakePlatform());
    const fallback = parseBackupBundle(await files.readText(await controller.rescue(draft)));
    expect(fallback.sessions).toEqual([storedSession]);
    expect(fallback.writingStates).toEqual([]);
    const currentSession = startInterview(storedSession, draft, 'open');
    const currentState = { composer: '', inputSource: 'dictated' as const };
    const current = parseBackupBundle(await files.readText(await controller.rescue(draft, currentSession, currentState)));
    expect(current.sessions).toEqual([currentSession]);
    expect(current.writingStates).toEqual([]);
    expect(storedState.composer).toBe('先前未发送输入');
    expect(currentState.inputSource).toBe('dictated');
  });

  it('已有文件读取失败仍可救援当前正文和会话，未发送输入留在内存', async () => {
    const files = new MemoryFileSystem(), repository = new MiniWorkRepository(files, '/rescue-read-error');
    const original = { ...emptyDraft(), title: '旧内容' };
    await repository.save(original, 0);
    const current = { ...original, inputMode: 'text' as const, textDraft: '只在内存中的最新正文。' };
    const session = newSession(current), state = { composer: '还想补充', inputSource: 'typed' as const };
    files.failOnce('readText', new Error('read unavailable'), path => path.endsWith('.work.json'));
    const controller = new MiniBackupController(repository, files, new FakePlatform());
    const restored = parseBackupBundle(await files.readText(await controller.rescue(current, session, state)));
    expect(restored.works[0]?.draft.textDraft).toBe(current.textDraft);
    expect(restored.sessions).toEqual([session]);
    expect(restored.writingStates).toEqual([]);
    expect(state.composer).toBe('还想补充');
  });
});
