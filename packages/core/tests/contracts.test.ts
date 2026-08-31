import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackupBundle } from '../src/backup.js';
import { utf8ByteLength } from '../src/platform.js';
import { completeVoice, emptyDraft, workFromDraft } from '../src/writing.js';

describe('跨平台核心契约', () => {
  it('生成可用标识并保持普通写作语义', () => {
    const draft = emptyDraft();
    const completed = completeVoice({ ...draft, pendingVoice: '小时候，院里有一棵桂花树。' });
    const work = workFromDraft(completed);
    expect(draft.id).toBeTruthy();
    expect(completed.segments).toHaveLength(1);
    expect(work.title).toBe('未命名作品');
    expect(work.draft).not.toBe(completed);
  });

  it('按 UTF-8 字节限制并往返当前备份格式', () => {
    expect(utf8ByteLength('岁月A')).toBe(7);
    const draft = completeVoice({ ...emptyDraft(), title: '旧时光', pendingVoice: '记得那年夏天。' });
    const bundle = parseBackupBundle(makeBackup([workFromDraft(draft)]));
    expect(bundle.works[0]?.draft.segments[0]?.text).toBe('记得那年夏天。');
    expect(bundle.sessions).toEqual([]);
  });
});
