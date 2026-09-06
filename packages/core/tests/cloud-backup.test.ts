import { describe, expect, it } from 'vitest';
import { emptyDraft, workFromDraft, makeBackup, makeBackupVolumes, parseBackupBundle } from '../src/index.js';

describe('完整输入备份 v6', () => {
  it('只有未发送输入的空正文也能救援导出', () => {
    const draft = emptyDraft();
    const state = { workId: draft.id, state: { composer: '尚未发送也尚未落盘', inputSource: 'typed' as const } };
    const restored = parseBackupBundle(makeBackup([], draft, [], [state]));
    expect(restored.works[0]?.id).toBe(draft.id);
    expect(restored.writingStates).toEqual([state]);
  });
  it('未发送输入往返且 v5 无输入可读，拒绝错误关联', () => {
    const work = workFromDraft({ ...emptyDraft(), title: '日记' });
    const writingStates = [{ workId: work.id, state: { composer: '还想补充', inputSource: 'typed' as const } }];
    const raw = makeBackup([work], null, [], writingStates);
    expect(parseBackupBundle(raw).writingStates).toEqual(writingStates);
    const legacy = JSON.parse(raw); legacy.schemaVersion = 5; delete legacy.writingStates;
    expect(parseBackupBundle(JSON.stringify(legacy)).writingStates).toEqual([]);
    const bad = JSON.parse(raw); bad.writingStates[0].workId = 'missing';
    expect(() => parseBackupBundle(JSON.stringify(bad))).toThrow('不匹配');
  });
  it('分卷各自可导入并保留所有作品和对应输入', () => {
    const works = Array.from({ length: 5 }, () => workFromDraft({ ...emptyDraft(), title: '日记', inputMode: 'text', textDraft: '字'.repeat(100) }));
    const states = works.map(work => ({ workId: work.id, state: { composer: '待发', inputSource: 'typed' as const } }));
    const volumes = makeBackupVolumes(works, [], states, 2400);
    expect(volumes.length).toBeGreaterThan(1);
    expect(volumes.flatMap(raw => parseBackupBundle(raw).works.map(work => work.id))).toEqual(works.map(work => work.id));
    expect(volumes.flatMap(raw => parseBackupBundle(raw).writingStates)).toEqual(states);
    expect(() => makeBackupVolumes(works, [], states, 1)).toThrow('单篇');
  });
});
