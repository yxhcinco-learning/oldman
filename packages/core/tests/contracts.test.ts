import { describe, expect, it } from 'vitest';
import { buildAiRequest } from '../src/ai-protocol.js';
import { makeBackup, parseBackupBundle } from '../src/backup.js';
import { newSession } from '../src/article-ai.js';
import { utf8ByteLength } from '../src/platform.js';
import { snapshotTopic, type WritingTopic } from '../src/topics.js';
import { completeVoice, emptyDraft, workFromDraft } from '../src/writing.js';

const topicFixture: WritingTopic = {
  id: 'old-courtyard', revision: 1, status: 'published', kind: 'slow', title: '记忆里的老院子',
  summary: '从院子里的一件小事出发，记录家庭生活、邻里关系和时代留下的日常印记。',
  whyItMatters: '具体的生活细节，比宏大的概括更能留住一个家庭的记忆。',
  updatedAt: '2026-08-31T08:00:00.000Z', publishedAt: '2026-08-31T08:00:00.000Z', expiresAt: null,
  sources: [{ id: 'source-1', title: '家庭记忆写作参考', publisher: '岁月有声', url: 'https://example.com/source', publishedAt: '2026-08-30T08:00:00.000Z' }],
  angles: [{ id: 'angle-1', title: '一个细节', prompt: '院子里最先浮现在您脑海里的一个细节是什么？' }],
  starterQuestion: '先简单介绍一下自己，再说说您和这个院子的关系吧。', tags: ['家庭', '记忆'],
  reviewedBy: 'editor', reviewedAt: '2026-08-31T08:00:00.000Z',
};

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

  it('在禁止动态代码生成的微信式运行时完成共享校验', () => {
    const originalFunction = globalThis.Function;
    globalThis.Function = (() => { throw new Error('dynamic code disabled'); }) as unknown as FunctionConstructor;
    try {
      const topicSnapshot = snapshotTopic(topicFixture, '2026-09-01T08:00:00.000Z');
      const draft = { ...emptyDraft({ topicSnapshot }), inputMode: 'text' as const, textDraft: '院里的桂花树每到秋天都很香。' };
      const session = newSession(draft);
      expect(buildAiRequest(session, 'chat', '帮我看看这段话', 'request-1').current.body).toContain('桂花树');
      expect(parseBackupBundle(makeBackup([workFromDraft(draft)], null, [session])).works).toHaveLength(1);
    } finally {
      globalThis.Function = originalFunction;
    }
  });
});
