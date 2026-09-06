import { describe, expect, it } from 'vitest';
import { aiRequestSchema, articleSessionSchema, buildAiRequest, conversationOf, copySession, emptyDraft, makeBackup, newSession,
  parseBackupBundle, prepareDialogue, settleDialogue, startInterview, workFromDraft, type AiResult, type ArticleSession } from '../src/index.js';

function setup(mode: 'normal' | 'interview' = 'interview', prompt = '你好', command: 'send' | 'finish' = 'send') {
  const draft = emptyDraft({ topicWritingMode: mode });
  let session = prepareDialogue(newSession(draft), draft, 'turn-1', prompt, command);
  session = { ...session, turns: [{ id: 'turn-1', action: 'dialogue', command, prompt, createdAt: '2026-09-06T00:00:00Z',
    inputVersionId: session.versions[0]!.id, status: 'running' }] };
  return { draft, session };
}
const reply = (answer: string): AiResult => ({ answer, citedVersionIds: [], dialogue: { intent: 'reply' } });

describe('统一小文会话', () => {
  it('问候作为消息保存而不推进题库、不产生素材，空正文可发送', () => {
    const { draft, session } = setup();
    const request = buildAiRequest(session, 'dialogue', '你好', 'turn-1');
    expect(aiRequestSchema.safeParse(request).success).toBe(true);
    const settled = settleDialogue(session, 'turn-1', reply('您好，我们慢慢聊。您愿意先介绍一下自己吗？'));
    expect(settled.conversation?.mode).toBe('interview');
    expect(settled.conversation?.materials).toEqual([]);
    expect(settled.conversation?.messages.at(-2)?.text).toBe('你好');
    expect(conversationOf(settled, draft)).toEqual(settled.conversation);
    expect(articleSessionSchema.safeParse(settled).success).toBe(true);
  });

  it('语义开启与结束保留连续历史，结束生成候选但不改正文', () => {
    const { draft, session } = setup('normal', '你来问，我来说');
    const started = settleDialogue(session, 'turn-1', { ...reply('好，您想聊什么？'), dialogue: { intent: 'start' } });
    expect(started.conversation?.mode).toBe('interview');
    const next = prepareDialogue(started, draft, 'turn-2', '聊完了，整理一下', 'send');
    next.turns.push({ ...session.turns[0]!, id: 'turn-2', prompt: '聊完了，整理一下' });
    const ended = settleDialogue(next, 'turn-2', { ...reply('还没有足够的内容可整理。'), dialogue: { intent: 'finish' } });
    expect(ended.conversation?.mode).toBe('conversation');
    expect(ended.conversation?.messages.some(message => message.text === '你来问，我来说')).toBe(true);
    expect(draft.textDraft).toBe('');
  });

  it('按钮结束先落普通模式，失败重试不重复原消息和切换', () => {
    const { draft, session } = setup('interview', '结束访谈并整理', 'finish');
    expect(session.conversation?.mode).toBe('conversation');
    const failed: ArticleSession = { ...session, turns: session.turns.map(turn => ({ ...turn, status: 'failed' })) };
    const retry = prepareDialogue(failed, draft, 'turn-1', '结束访谈并整理', 'finish');
    expect(retry.conversation?.messages).toEqual(session.conversation?.messages);
    expect(settleDialogue(failed, 'turn-1', reply('迟到回复'))).toEqual(failed);
  });

  it('素材必须引用原话，更正后请求只携带有效材料及来源', () => {
    const { draft, session } = setup('interview', '我是1990年参加工作的。');
    const first = settleDialogue(session, 'turn-1', { ...reply('当时做什么工作？'), dialogue: { intent: 'reply', material: { text: '我是1990年参加工作的。' } } });
    const next = prepareDialogue(first, draft, 'turn-2', '说错了，我是1991年参加工作的。', 'send');
    next.turns = [...next.turns, { ...session.turns[0]!, id: 'turn-2', prompt: '说错了，我是1991年参加工作的。' }];
    const corrected = settleDialogue(next, 'turn-2', { ...reply('按1991年记。'), dialogue: { intent: 'reply', material: { text: '我是1991年参加工作的。', supersedes: 'm-turn-1' } } });
    expect(corrected.conversation?.materials).toHaveLength(2);
    expect(articleSessionSchema.safeParse(corrected).success).toBe(true);
    const request = buildAiRequest(corrected, 'dialogue', '结束访谈并整理', 'turn-3', { command: 'finish' });
    expect(request.conversation?.materials.map(material => material.text)).toEqual(['我是1991年参加工作的。']);
    expect(() => settleDialogue(session, 'turn-1', { ...reply('好'), dialogue: { intent: 'reply', material: { text: '我是一名医生' } } })).toThrow();
  });

  it('访谈改文只产生确认，意外正文被拒绝', () => {
    const { session } = setup('interview', '帮我修改第二段');
    const next = settleDialogue(session, 'turn-1', { ...reply('先结束访谈再修改吗？'), dialogue: { intent: 'confirm-edit' } });
    expect(next.conversation?.pendingEdit).toBe('帮我修改第二段');
    expect(next.conversation?.mode).toBe('interview');
    expect(() => settleDialogue(session, 'turn-1', { ...reply('修改'), body: '越界正文' })).toThrow();
  });

  it('v5备份与副本恢复保留模式、消息及素材引用，老版本仍可读', () => {
    const { draft, session } = setup('interview', '我当过老师。');
    const settled = settleDialogue(session, 'turn-1', { ...reply('您教什么？'), dialogue: { intent: 'reply', material: { text: '我当过老师。' } } });
    const raw = makeBackup([workFromDraft(draft)], null, [settled]);
    expect(JSON.parse(raw).schemaVersion).toBe(5);
    const restored = parseBackupBundle(raw).sessions[0]!;
    const copy = copySession(restored, 'copy');
    expect(copy.conversation?.mode).toBe('interview');
    expect(articleSessionSchema.safeParse(copy).success).toBe(true);
    expect(copy.conversation?.materials[0]?.sourceMessageId).not.toBe(restored.conversation?.materials[0]?.sourceMessageId);
    const legacy = JSON.parse(raw); legacy.schemaVersion = 4; delete legacy.sessions[0].conversation;
    expect(parseBackupBundle(JSON.stringify(legacy)).sessions).toHaveLength(1);
  });

  it('重开开启过的会话不覆盖会话模式，也不重复开场', () => {
    const { draft, session } = setup('normal');
    const started = startInterview(session, draft, 'start');
    expect(startInterview(started, draft, 'again')).toEqual(started);
    expect(conversationOf(started, { ...draft, topicWritingMode: 'normal' }).mode).toBe('interview');
  });
});
