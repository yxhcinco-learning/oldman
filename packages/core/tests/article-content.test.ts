import { describe, expect, it } from 'vitest';
import { completeVoice, emptyDraft, hasArticleContent, hasContent, withoutTransientInput } from '../src/index.js';

describe('实际文章与输入框边界', () => {
  it('只有用户标题或当前输入模式下的正文可以建立文章', () => {
    expect(hasArticleContent(emptyDraft())).toBe(false);
    expect(hasArticleContent({ ...emptyDraft(), title: ' \n ', inputMode: 'text', textDraft: ' \n ' })).toBe(false);
    expect(hasArticleContent({ ...emptyDraft(), title: '一段往事' })).toBe(true);
    expect(hasArticleContent({ ...emptyDraft(), inputMode: 'text', textDraft: '当前文字正文。' })).toBe(true);
    expect(hasArticleContent({ ...emptyDraft(), segments: [{ id: 'segment', text: '已确认的语音正文。' }] })).toBe(true);
    expect(hasArticleContent({ ...emptyDraft(), inputMode: 'text', segments: [{ id: 'old', text: '文字模式下的过时段落。' }] })).toBe(false);
    expect(hasArticleContent({ ...emptyDraft(), inputMode: 'voice', textDraft: '语音模式下未采用的文字缓存。' })).toBe(false);
  });

  it('待确认语音、编辑框和素材仅属于广义输入，确认进入正文后才算文章', () => {
    const draft = { ...emptyDraft(), pendingVoice: '待确认的一句话。', segmentEdit: { id: 'pending', text: '还在编辑的一句话。' },
      materials: [{ id: 'note', source: 'user-note' as const, text: '尚未整理的素材。', selected: true, createdAt: '2026-09-08T00:00:00.000Z' }] };
    expect(hasContent(draft)).toBe(true);
    expect(hasArticleContent(draft)).toBe(false);
    expect(hasArticleContent(completeVoice(draft))).toBe(true);
    expect(draft.segments).toEqual([]);
  });

  it('剥离输入框返回独立副本，不修改原输入、正文、素材或嵌套对象', () => {
    const draft = { ...emptyDraft(), title: '文章', segments: [{ id: 'first', text: '已确认的正文。' }], pendingVoice: '暂存语音',
      segmentEdit: { id: 'first', text: '编辑框中的替换内容' },
      materials: [{ id: 'note', source: 'user-note' as const, text: '已发送的素材。', selected: true, createdAt: '2026-09-08T00:00:00.000Z' }] };
    const snapshot = withoutTransientInput(draft);
    expect(snapshot).toEqual({ ...draft, pendingVoice: '', segmentEdit: null });
    snapshot.segments[0].text = '仅改变副本';
    snapshot.materials[0].text = '仅改变副本素材';
    expect(draft.segments[0].text).toBe('已确认的正文。');
    expect(draft.materials[0].text).toBe('已发送的素材。');
    expect(draft.pendingVoice).toBe('暂存语音');
    expect(draft.segmentEdit.text).toBe('编辑框中的替换内容');
  });
});
