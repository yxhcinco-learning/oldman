import { describe, expect, it } from 'vitest';
import { completeVoice, emptyDraft } from '../miniprogram/domain/core';
import { appendDictation, stageBodyDictation } from '../miniprogram/speech/dictation';
import { ConversationMemory } from '../miniprogram/state/conversation-memory';

describe('听写只进入用户输入', () => {
  it('正文按新段落追加，小文/采访输入按空格追加且保持未发送内存状态', () => {
    expect(appendDictation('原正文', '  新口述  ', 100, '\n\n')).toEqual({ value: '原正文\n\n新口述', accepted: '新口述', truncated: false });
    expect(appendDictation('已有要求', '补充要求', 100, ' ').value).toBe('已有要求 补充要求');
    const memory = new ConversationMemory();
    memory.updateComposer('work-one', '已有要求 补充要求', 'dictated');
    expect(memory.read('work-one')).toEqual({ composer: '已有要求 补充要求', inputSource: 'dictated', requestStatus: 'idle', error: '' });
  });

  it('达到长度上限时只返回可容纳部分并明确标记，不会越界', () => {
    expect(appendDictation('1234', '五六七', 7, ' ')).toEqual({ value: '1234 五六', accepted: '五六', truncated: true });
    expect(appendDictation('12345', '新内容', 5, ' ')).toEqual({ value: '12345', accepted: '', truncated: true });
  });

  it('正文语音先进入待确认文字，只有点击完成才追加到正文', () => {
    const original = completeVoice({ ...emptyDraft(), pendingVoice: '原正文。' });
    const staged = stageBodyDictation(original, '新口述。');
    expect(staged.draft.segments).toEqual(original.segments);
    expect(staged.draft.textDraft).toBe(original.textDraft);
    expect(staged.draft.pendingVoice).toBe('新口述。');

    const completed = completeVoice(staged.draft);
    expect(completed.pendingVoice).toBe('');
    expect(completed.segments.map(segment => segment.text)).toEqual(['原正文。', '新口述。']);
  });
});
