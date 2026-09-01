import { describe, expect, it } from 'vitest';
import { type TopicSnapshot, type WritingMaterial } from '../miniprogram/domain/core';
import { FIRST_INTERVIEW_INTRO, FIRST_INTERVIEW_QUESTION, interviewMessages, interviewQuestion } from '../miniprogram/interview/flow';
import { ConversationMemory } from '../miniprogram/state/conversation-memory';

const topic: TopicSnapshot = {
  id: 'old-courtyard', revision: 1, kind: 'slow', title: '记忆里的老院子',
  summary: '从院子里的一件小事出发，记录家庭生活、邻里关系和时代留下的日常印记。',
  whyItMatters: '具体的生活细节，比宏大的概括更能留住一个家庭的记忆。', updatedAt: '2026-08-31T08:00:00.000Z',
  sources: [{ id: 'source-1', title: '参考', publisher: '岁月有声', url: 'https://example.com', publishedAt: '2026-08-30T08:00:00.000Z' }],
  angles: [{ id: 'angle-1', title: '细节', prompt: '院子里最先浮现的一个细节是什么？' }],
  starterQuestion: '您和这个院子是什么关系？', tags: ['记忆'], capturedAt: '2026-09-01T08:00:00.000Z',
};

describe('小程序采访与小文页面状态', () => {
  it('首次采访使用与 H5 一致的两条精简开场消息', () => {
    expect(FIRST_INTERVIEW_INTRO).toBe('您好，我是小文，您的写作助手。接下来我们围绕这个话题聊一聊。');
    expect(FIRST_INTERVIEW_QUESTION).toBe('先请您简单介绍一下自己吧。');
    expect(interviewMessages([])).toEqual([{ id: 'intro', role: 'assistant', text: FIRST_INTERVIEW_INTRO }]);
  });

  it('一次推进一个问题并能只替换当前问题', () => {
    expect(interviewQuestion(topic, 0)).toBe(FIRST_INTERVIEW_QUESTION);
    expect(interviewQuestion(topic, 1)).toBe(topic.starterQuestion);
    expect(interviewQuestion(topic, 2)).toBe(topic.angles[0]?.prompt);
    expect(interviewQuestion(topic, 0, 1)).toBe(topic.starterQuestion);
  });

  it('恢复时按问题和回答重建采访对话', () => {
    const material: WritingMaterial = { id: 'answer-1', source: 'interview-answer', text: '我小时候住在那里。',
      question: FIRST_INTERVIEW_QUESTION, createdAt: '2026-09-01T08:00:00.000Z', selected: true };
    expect(interviewMessages([material]).map(item => [item.role, item.text])).toEqual([
      ['assistant', FIRST_INTERVIEW_INTRO], ['assistant', FIRST_INTERVIEW_QUESTION], ['user', '我小时候住在那里。'],
    ]);
  });

  it('未发送输入只跨页面保存在内存，失败时保留且不会自动清空', () => {
    const memory = new ConversationMemory();
    memory.updateComposer('work-1', '还想补充一句', 'dictated');
    memory.markBlocked('work-1', '当前离线，未发送');
    expect(memory.read('work-1')).toEqual({ composer: '还想补充一句', inputSource: 'dictated', requestStatus: 'blocked', error: '当前离线，未发送' });
    expect(memory.read('work-2').composer).toBe('');
    memory.clearComposer('work-1');
    expect(memory.read('work-1')).toMatchObject({ composer: '', requestStatus: 'idle' });
  });
});
