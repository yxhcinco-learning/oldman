import { describe, expect, it } from 'vitest';
import { conversationOf, emptyDraft, workFromDraft, makeBackup, makeBackupVolumes, newSession, parseBackupBundle, prepareDialogue,
  startInterview, type ArticleSession, type TopicSnapshot } from '../src/index.js';

const topic: TopicSnapshot = {
  id: 'childhood', revision: 1, kind: 'slow', title: '小时候的生活', summary: '回想小时候与家人相处的点滴，记录当年的生活经历。',
  whyItMatters: '每一段日常经历都值得慢慢记录。', updatedAt: '2026-09-08T00:00:00.000Z', capturedAt: '2026-09-08T00:00:00.000Z',
  sources: [], angles: [{ id: 'family', title: '我的家人', prompt: '记得哪些家人的故事？' }], starterQuestion: '先讲讲小时候的家吧。', tags: ['回忆'],
};

describe('完整输入备份 v6', () => {
  it.each(['typed', 'dictated'] as const)('只有未发送 %s 输入的空正文也能救援导出', inputSource => {
    const draft = emptyDraft();
    const state = { workId: draft.id, state: { composer: '尚未发送也尚未落盘', inputSource } };
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

  it('首次用户消息、真实结果与待确认修改保持完整往返', () => {
    const draft = emptyDraft();
    const base = newSession(draft);
    const message = prepareDialogue(base, draft, 'message', '小时候我住在河边。', 'send');
    const result: ArticleSession = { ...base, turns: [{ id: 'result', createdAt: '2026-09-08T00:00:00.000Z',
      action: 'question', prompt: '', inputVersionId: base.versions[0]!.id, status: 'answered',
      result: { answer: '记得当时常和谁一起玩吗？', citedVersionIds: [] } }] };
    const pendingEdit: ArticleSession = { ...base, conversation: { mode: 'interview', messages: [], materials: [], pendingEdit: '请保留第二段。' } };
    for (const session of [message, result, pendingEdit]) {
      const restored = parseBackupBundle(makeBackup([], draft, [session]));
      expect(restored.works.map(work => work.id)).toEqual([draft.id]);
      expect(restored.sessions).toEqual([session]);
    }
  });

  it('待确认语音保留在草稿中，不要求先写入正文', () => {
    const draft = { ...emptyDraft(), pendingVoice: '这句话还没有确认写入。' };
    const restored = parseBackupBundle(makeBackup([], draft));
    expect(restored.works[0]?.draft).toEqual(draft);
    expect(restored.works[0]?.segments).toEqual([]);
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
