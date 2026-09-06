import { type AiResult, type ArticleSession, type DialogueCommand, type XiaoWenConversation } from './article-ai.js';
import type { Draft } from './writing.js';

export const INTERVIEW_INTRO = '您好，我是小文，您的写作助手。接下来我们围绕这个话题聊一聊。';
export const INTERVIEW_FIRST_QUESTION = '先请您简单介绍一下自己吧。';

export function conversationView(session: ArticleSession, draft: Draft) {
  return conversationOf(session, draft).messages.map(message => {
    const turn = session.turns.find(item => item.id === message.turnId);
    return { ...message, turnId: turn?.id ?? '', hasCandidate: message.role === 'assistant' && Boolean(turn?.result?.body),
      canRetry: message.role === 'user' && Boolean(turn && ['failed', 'cancelled'].includes(turn.status)),
      error: message.role === 'user' ? turn?.error ?? '' : '', ai: message.role === 'assistant' && Boolean(turn?.result),
      status: turn?.status ?? '' };
  });
}

/** Legacy order is retained per source; no timestamps are invented. */
export function conversationOf(session: ArticleSession, draft: Draft): XiaoWenConversation {
  if (session.conversation) return session.conversation;
  const messages: XiaoWenConversation['messages'] = [];
  const materials: XiaoWenConversation['materials'] = [];
  for (const [index, material] of draft.materials.entries()) {
    if (material.question) messages.push({ id: `legacy-q-${index}`, role: 'assistant', text: material.question });
    messages.push({ id: `legacy-u-${index}`, role: 'user', text: material.text });
    materials.push({ id: material.id, text: material.text, sourceMessageId: `legacy-u-${index}` });
  }
  for (const [index, turn] of session.turns.entries()) {
    if (turn.action !== 'interview') messages.push({ id: `legacy-turn-u-${index}`, role: 'user', text: turn.prompt || '与小文对话', turnId: turn.id });
    if (turn.result && !draft.materials.some(material => material.question === turn.result!.answer)) {
      messages.push({ id: `legacy-turn-a-${index}`, role: 'assistant', text: turn.result.answer, turnId: turn.id });
    }
  }
  if (draft.topicWritingMode === 'interview' && !messages.length) {
    messages.push({ id: 'interview-intro', role: 'assistant', text: INTERVIEW_INTRO },
      { id: 'interview-first', role: 'assistant', text: INTERVIEW_FIRST_QUESTION });
  }
  return { mode: draft.topicWritingMode === 'interview' ? 'interview' : 'conversation', messages, materials };
}

export function startInterview(session: ArticleSession, draft: Draft, eventId: string): ArticleSession {
  const conversation = conversationOf(session, draft);
  if (conversation.mode === 'interview') return { ...session, conversation };
  const text = conversation.messages.length ? '已开启访谈。您想接着聊哪一部分？' : draft.topicSnapshot ? INTERVIEW_FIRST_QUESTION : '您想聊什么？';
  return { ...session, conversation: { ...conversation, mode: 'interview', pendingEdit: undefined,
    messages: [...conversation.messages, { id: eventId, role: 'system', text: '已开启访谈' },
      ...(!conversation.messages.length ? [{ id: `intro-${eventId}`, role: 'assistant' as const, text: INTERVIEW_INTRO }] : []),
      { id: `a-${eventId}`, role: 'assistant', text }] } };
}

export function prepareDialogue(session: ArticleSession, draft: Draft, turnId: string, prompt: string, command: DialogueCommand): ArticleSession {
  let conversation = conversationOf(session, draft);
  if (conversation.messages.some(message => message.turnId === turnId)) return { ...session, conversation };
  if (command === 'confirm-edit' && !conversation.pendingEdit) throw new Error('没有待确认的修改要求。');
  if (command === 'finish' || command === 'confirm-edit') {
    conversation = { ...conversation, mode: 'conversation', pendingEdit: undefined,
      messages: [...conversation.messages, { id: `mode-${turnId}`, role: 'system', text: '已结束访谈，正在整理', turnId }] };
  }
  return { ...session, conversation: { ...conversation, messages: [...conversation.messages,
    { id: `u-${turnId}`, role: 'user', text: prompt, turnId }] } };
}

export function validateDialogueResult(result: AiResult, mode: XiaoWenConversation['mode'], command: DialogueCommand,
  prompt: string, materials: XiaoWenConversation['materials']): AiResult {
  const detail = result.dialogue;
  if (!detail) throw new Error('小文返回的会话状态不完整，请重试。');
  if (['finish', 'confirm-edit'].includes(command) && detail.intent !== 'finish') throw new Error('小文没有完成结束访谈请求。');
  if (detail.intent === 'confirm-edit' && mode !== 'interview') throw new Error('当前不是访谈模式。');
  if (result.body && !(detail.intent === 'finish' || (mode === 'conversation' && detail.intent === 'edit'))) throw new Error('本轮对话不允许生成正文。');
  if (detail.material && (!prompt.includes(detail.material.text) || (detail.material.supersedes && !materials.some(material => material.id === detail.material!.supersedes)))) {
    throw new Error('小文引用的回答无法核对。');
  }
  return result;
}

export function settleDialogue(session: ArticleSession, turnId: string, result: AiResult): ArticleSession {
  const turn = session.turns.find(item => item.id === turnId);
  const conversation = session.conversation;
  if (!turn || turn.status !== 'running' || !conversation) return session;
  validateDialogueResult(result, conversation.mode, turn.command ?? 'send', turn.prompt, conversation.materials);
  const detail = result.dialogue!;
  const mode = detail.intent === 'start' ? 'interview' : detail.intent === 'finish' ? 'conversation' : conversation.mode;
  const messages = [...conversation.messages];
  if (mode !== conversation.mode) messages.push({ id: `mode-${turnId}`, role: 'system', text: mode === 'interview' ? '已开启访谈' : '已结束访谈', turnId });
  messages.push({ id: `a-${turnId}`, role: 'assistant', text: result.answer, turnId });
  const sourceMessageId = conversation.messages.find(message => message.turnId === turnId && message.role === 'user')?.id;
  if (detail.material && !sourceMessageId) throw new Error('当前回答来源已不存在。');
  const materials = detail.material ? [...conversation.materials, { id: `m-${turnId}`, sourceMessageId: sourceMessageId!, ...detail.material }] : conversation.materials;
  return { ...session, conversation: { mode, messages, materials, pendingEdit: detail.intent === 'confirm-edit' ? turn.prompt : undefined },
    turns: session.turns.map(item => item.id === turnId ? { ...item, result, status: result.body ? 'ready' : 'answered', error: undefined } : item) };
}
