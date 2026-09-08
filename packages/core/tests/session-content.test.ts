import { describe, expect, it } from 'vitest';
import { checkpointSession, conversationOf, emptyDraft, hasSessionContent, newSession, prepareDialogue, startInterview,
  type ArticleSession, type AiTurn } from '../src/index.js';

describe('实际会话内容边界', () => {
  it('缺少会话、空白版本、模式与静态开场都不算用户已写作', () => {
    const draft = emptyDraft();
    const session = newSession(draft);
    expect(hasSessionContent()).toBe(false);
    expect(hasSessionContent(null)).toBe(false);
    expect(hasSessionContent(session)).toBe(false);
    expect(hasSessionContent({ ...session, conversation: conversationOf(session, draft) })).toBe(false);
    const opened = startInterview(session, draft, 'open');
    expect(opened.conversation?.messages.some(message => message.role === 'system')).toBe(true);
    expect(opened.conversation?.messages.some(message => message.role === 'assistant')).toBe(true);
    expect(hasSessionContent(opened)).toBe(false);
    const interview = emptyDraft({ topicWritingMode: 'interview' });
    expect(hasSessionContent(startInterview(newSession(interview), interview, 'initial'))).toBe(false);
  });

  it('用户刚发出的消息即使尚无请求结果也必须保留', () => {
    const draft = emptyDraft();
    const session = prepareDialogue(newSession(draft), draft, 'message', '我小时候住在河边。', 'send');
    expect(session.turns).toHaveLength(0);
    expect(hasSessionContent(session)).toBe(true);
  });

  it('素材与待确认修改独立作为需要保留的内容', () => {
    const session = newSession(emptyDraft());
    const conversation = { mode: 'interview' as const, messages: [], materials: [] };
    expect(hasSessionContent({ ...session, conversation: { ...conversation, pendingEdit: '请把第二段的时间改成九月。' } })).toBe(true);
    expect(hasSessionContent({ ...session, conversation: { ...conversation,
      materials: [{ id: 'material', sourceMessageId: 'source', text: '我曾是一名老师。' }] } })).toBe(true);
    expect(hasSessionContent({ ...session, conversation: { ...conversation, pendingEdit: ' \n ' } })).toBe(false);
  });

  it.each(['running', 'failed', 'cancelled', 'answered'] as const)('真实 %s 请求记录不会被空正文筛掉', status => {
    const session = newSession(emptyDraft());
    const turn: AiTurn = { id: 'request', action: 'question', prompt: '', inputVersionId: session.versions[0]!.id,
      createdAt: '2026-09-08T00:00:00.000Z', status,
      ...(status === 'answered' ? { result: { answer: '您可以从童年的经历开始。', citedVersionIds: [] } } : {}) };
    expect(hasSessionContent({ ...session, turns: [turn] })).toBe(true);
  });

  it('当前正文清空后仍保留非空历史标题或正文', () => {
    const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '我从前住在这里。' };
    const session = checkpointSession(newSession(draft), { ...draft, textDraft: '' });
    expect(session.versions.at(-1)?.body).toBe('');
    expect(hasSessionContent(session)).toBe(true);
    expect(hasSessionContent(newSession({ ...emptyDraft(), title: '那年夏天' }))).toBe(true);
    const spaces: ArticleSession = newSession({ ...emptyDraft(), title: ' ', inputMode: 'text', textDraft: '\n ' });
    expect(hasSessionContent(spaces)).toBe(false);
  });
});
