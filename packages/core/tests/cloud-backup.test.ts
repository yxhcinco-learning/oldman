import { describe, expect, it } from 'vitest';
import { conversationOf, emptyDraft, workFromDraft, makeBackup, makeBackupVolumes, newSession, parseBackupBundle, prepareDialogue,
  startInterview, type ArticleSession, type TopicSnapshot } from '../src/index.js';

const topic: TopicSnapshot = {
  id: 'childhood', revision: 1, kind: 'slow', title: '小时候的生活', summary: '回想小时候与家人相处的点滴，记录当年的生活经历。',
  whyItMatters: '每一段日常经历都值得慢慢记录。', updatedAt: '2026-09-08T00:00:00.000Z', capturedAt: '2026-09-08T00:00:00.000Z',
  sources: [], angles: [{ id: 'family', title: '我的家人', prompt: '记得哪些家人的故事？' }], starterQuestion: '先讲讲小时候的家吧。', tags: ['回忆'],
};

describe('实际文章备份与旧输入格式兼容', () => {
  it.each(['typed', 'dictated'] as const)('只有未发送 %s 输入不会建立备份文章', inputSource => {
    const draft = emptyDraft();
    const state = { workId: draft.id, state: { composer: '尚未发送也尚未落盘', inputSource } };
    const restored = parseBackupBundle(makeBackup([], draft, [], [state]));
    expect(restored.works).toEqual([]);
    expect(restored.writingStates).toEqual([]);
  });
  it('旧 v6 输入仍能读取，v5 保持兼容并拒绝错误关联', () => {
    const work = workFromDraft({ ...emptyDraft(), title: '日记' });
    const writingStates = [{ workId: work.id, state: { composer: '还想补充', inputSource: 'typed' as const } }];
    const oldBackup = JSON.parse(makeBackup([work]));
    oldBackup.works[0].draft.pendingVoice = '旧备份中的待确认语音';
    oldBackup.works[0].draft.segmentEdit = { id: 'pending', text: '旧备份中的编辑框' };
    oldBackup.writingStates = writingStates;
    const restored = parseBackupBundle(JSON.stringify(oldBackup));
    expect(restored.writingStates).toEqual(writingStates);
    expect(restored.works[0].draft).toMatchObject({ pendingVoice: '旧备份中的待确认语音', segmentEdit: { id: 'pending', text: '旧备份中的编辑框' } });
    const legacy = { ...oldBackup }; legacy.schemaVersion = 5; delete legacy.writingStates;
    expect(parseBackupBundle(JSON.stringify(legacy)).writingStates).toEqual([]);
    const bad = structuredClone(oldBackup); bad.writingStates[0].workId = 'missing';
    expect(() => parseBackupBundle(JSON.stringify(bad))).toThrow('不匹配');
    const exportedAgain = parseBackupBundle(makeBackup(restored.works, null, restored.sessions, restored.writingStates));
    expect(exportedAgain.writingStates).toEqual([]);
    expect(exportedAgain.works[0].draft).toMatchObject({ pendingVoice: '', segmentEdit: null });
    expect(restored.works[0].draft.pendingVoice).toBe('旧备份中的待确认语音');
  });
  it('分卷各自可导入并保留所有文章，排除输入框状态', () => {
    const works = Array.from({ length: 5 }, () => workFromDraft({ ...emptyDraft(), title: '日记', inputMode: 'text', textDraft: '字'.repeat(100) }));
    const states = works.map(work => ({ workId: work.id, state: { composer: '待发', inputSource: 'typed' as const } }));
    const volumes = makeBackupVolumes(works, [], states, 2400);
    expect(volumes.length).toBeGreaterThan(1);
    expect(volumes.flatMap(raw => parseBackupBundle(raw).works.map(work => work.id))).toEqual(works.map(work => work.id));
    expect(volumes.flatMap(raw => parseBackupBundle(raw).writingStates)).toEqual([]);
    expect(() => makeBackupVolumes(works, [], states, 1)).toThrow('单篇');
  });

  it.each(['blank', 'conversation', 'topic', 'interview', 'topic-interview'] as const)('没有输入的 %s 上下文不会通过导出生成文章', mode => {
    const draft = emptyDraft({ topicSnapshot: mode.startsWith('topic') ? topic : null,
      topicWritingMode: mode.endsWith('interview') ? 'interview' : 'normal' });
    let session = newSession(draft);
    if (mode === 'conversation') session = { ...session, conversation: conversationOf(session, draft) };
    if (mode.endsWith('interview')) session = startInterview(session, draft, 'open');
    const restored = parseBackupBundle(makeBackup([], draft, [session], [{ workId: draft.id, state: { composer: ' \n ', inputSource: 'typed' } }]));
    expect(restored).toEqual({ works: [], sessions: [], writingStates: [], disclosures: [] });
  });

  it('按钮开启的静态访谈也不生成导出文章', () => {
    const draft = emptyDraft();
    const session = startInterview(newSession(draft), draft, 'open');
    expect(session.conversation?.messages.some(message => message.role === 'system')).toBe(true);
    expect(parseBackupBundle(makeBackup([], draft, [session])).works).toEqual([]);
  });

  it('会话、结果和待确认修改本身不建稿，实际正文出现后保留其已发送历史', () => {
    const draft = emptyDraft();
    const base = newSession(draft);
    const message = prepareDialogue(base, draft, 'message', '小时候我住在河边。', 'send');
    const result: ArticleSession = { ...base, turns: [{ id: 'result', createdAt: '2026-09-08T00:00:00.000Z',
      action: 'question', prompt: '', inputVersionId: base.versions[0]!.id, status: 'answered',
      result: { answer: '记得当时常和谁一起玩吗？', citedVersionIds: [] } }] };
    const pendingEdit: ArticleSession = { ...base, conversation: { mode: 'interview', messages: [], materials: [], pendingEdit: '请保留第二段。' } };
    for (const session of [message, result, pendingEdit]) {
      const restored = parseBackupBundle(makeBackup([], draft, [session]));
      expect(restored.works).toEqual([]);
      expect(restored.sessions).toEqual([]);
      const written = { ...draft, inputMode: 'text' as const, textDraft: '小时候我住在河边。' };
      const saved = parseBackupBundle(makeBackup([], written, [session]));
      expect(saved.works.map(work => work.id)).toEqual([draft.id]);
      expect(saved.sessions).toEqual([session]);
    }
  });

  it('待确认语音不会作为正文或备份文章，原页面输入保持', () => {
    const draft = { ...emptyDraft(), pendingVoice: '这句话还没有确认写入。' };
    const restored = parseBackupBundle(makeBackup([], draft));
    expect(restored.works).toEqual([]);
    expect(draft.pendingVoice).toBe('这句话还没有确认写入。');
  });

  it('只有素材或非空历史版本而当前标题正文为空也不会建立备份文章', () => {
    const draft = { ...emptyDraft(), materials: [{ id: 'note', source: 'user-note' as const, text: '尚未写入文章的素材。', selected: true, createdAt: '2026-09-08T00:00:00.000Z' }] };
    const history = newSession({ ...draft, inputMode: 'text', textDraft: '尚未成为当前正文的旧版本。' });
    expect(parseBackupBundle(makeBackup([], draft, [history])).works).toEqual([]);
  });

  it('新导出的全部文章快照排除输入框，已确认正文与会话继续保留', () => {
    const original = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '已经确认的正文。', pendingVoice: '不导出的待确认语音',
      segmentEdit: { id: 'pending', text: '不导出的段落编辑框' } };
    const work = workFromDraft(original), session = newSession(original);
    const state = { workId: work.id, state: { composer: '不导出的未发送输入', inputSource: 'typed' as const } };
    for (const current of [null, original]) {
      const raw = makeBackup([work], current, [session], [state]);
      const restored = parseBackupBundle(raw);
      expect(restored.works[0].draft).toMatchObject({ textDraft: original.textDraft, pendingVoice: '', segmentEdit: null });
      expect(restored.sessions).toEqual([session]);
      expect(restored.writingStates).toEqual([]);
      expect(raw).not.toContain('不导出的');
    }
    expect(original.pendingVoice).toBe('不导出的待确认语音');
    expect(work.draft.segmentEdit?.text).toBe('不导出的段落编辑框');
    expect(state.state.composer).toBe('不导出的未发送输入');
  });

  it('已保存的文章被清空时导出当前空值，不恢复旧正文', () => {
    const old = workFromDraft({ ...emptyDraft(), inputMode: 'text', title: '旧标题', textDraft: '不能再出现在当前正文中的旧内容。' });
    const current = { ...emptyDraft(), id: old.id, inputMode: 'text' as const };
    const session = newSession(current);
    const restored = parseBackupBundle(makeBackup([old], current, [session]));
    expect(restored.works).toHaveLength(1);
    expect(restored.works[0]).toMatchObject({ id: old.id, createdAt: old.createdAt, revision: old.revision + 1, segments: [], draft: current });
    expect(restored.sessions).toEqual([session]);
    expect(old.draft.textDraft).toBe('不能再出现在当前正文中的旧内容。');
  });

  it('历史空文章与回收站记录仍原样保留，不清理旧数据', () => {
    const oldEmpty = workFromDraft(emptyDraft());
    const deleted = { ...workFromDraft({ ...emptyDraft(), title: '保留的回收站记录' }), deletedAt: '2026-09-08T00:00:00.000Z' };
    const session = startInterview(newSession(oldEmpty.draft), oldEmpty.draft, 'legacy-open');
    const current = emptyDraft();
    const restored = parseBackupBundle(makeBackup([oldEmpty, deleted], current, [session, newSession(current)]));
    expect(restored.works).toEqual([oldEmpty, deleted]);
    expect(restored.sessions).toEqual([session]);
  });
});
