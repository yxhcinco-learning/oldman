import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { BackIcon } from '../../components/Icons';
import { articleText, effectiveSegments, completeSegment, completeVoice, type Draft, type InputMode } from '../../lib/domain/writing';
import { VoicePanel } from '../speech/VoicePanel';

export function Editor({ draft, update, onSave, onBack, onDemo, onMore, saveStatus }: {
  draft: Draft; update: (draft: Draft) => void; onSave: () => void; onBack: () => void;
  onDemo: (entry: 'chat' | 'optimize') => void; onMore: () => void; saveStatus: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  // Event callbacks always read the currently rendered document.
  useLayoutEffect(() => { draftRef.current = draft; }, [draft]);
  const setMode = (mode: InputMode) => {
    if (mode === draft.inputMode) { if (mode === 'text') textarea.current?.focus(); return; }
    const segments = effectiveSegments(draft);
    flushSync(() => update({ ...draft, segments, textDraft: articleText(segments), inputMode: mode }));
    if (mode === 'text') textarea.current?.focus({ preventScroll: true });
  };
  if (draft.segmentEdit) return <>
    <header className="topbar"><button className="icon-button" type="button" aria-label="返回文章" onClick={() => update(completeSegment(draft))}><BackIcon /></button><div><strong>编辑这一段</strong></div><span /></header>
    <div className="segment-editor-wrap"><span className="quote-mark" aria-hidden="true">“</span><textarea autoFocus className="segment-editor" aria-label="段落内容" maxLength={1_000_000} value={draft.segmentEdit.text} onChange={e => update({ ...draft, segmentEdit: { ...draft.segmentEdit!, text: e.target.value } })} /><p>修改会自动保存在本机</p></div>
    <footer className="simple-footer"><button className="primary-button" type="button" onClick={() => update(completeSegment(draft))}>完成修改</button></footer>
  </>;
  return <>
    <header className="topbar editor-topbar"><button className="icon-button" type="button" aria-label="返回作品" onClick={onBack}><BackIcon /></button><div><strong>开始写作</strong></div><button className="text-button save-text" type="button" onClick={onSave}>保存</button></header>
    <div className={`editor-scroll ${draft.inputMode === 'text' ? 'text-mode' : ''}`}>
      <input className="title-input" maxLength={120} value={draft.title} onChange={e => update({ ...draft, title: e.target.value })} placeholder="输入标题" aria-label="文章标题" />
      {draft.inputMode === 'text' ? <textarea ref={textarea} className="full-text-editor" value={draft.textDraft} maxLength={1_000_000} onChange={e => update({ ...draft, textDraft: e.target.value })} placeholder="从想说的一句话开始" aria-label="文章正文" inputMode="text" /> : <div className="story-content">
        {!draft.segments.length && <div className="empty-writing"><p>从想说的一句话开始</p></div>}
        {draft.segments.map((s, i) => <div key={s.id}><button className="story-paragraph" type="button" aria-label={`编辑第 ${i + 1} 段`} onClick={() => update({ ...draft, segmentEdit: { ...s } })}><span>{String(i + 1).padStart(2, '0')}</span><p>{s.text}</p></button></div>)}
      </div>}
    </div>
    <div className="save-row"><span role="status">{saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存到本机' : saveStatus === 'error' ? '尚未保存，请先备份' : '内容仅保存在本机'}</span><button type="button" onClick={onMore} aria-label="导出与更多操作">•••</button></div>
    <footer className={`editor-dock ${draft.inputMode}`}><div className="creation-controls" aria-label="创作方式与工具"><div className="mode-tabs" role="tablist" aria-label="输入方式">
      <button className={draft.inputMode === 'voice' ? 'active' : ''} type="button" role="tab" aria-selected={draft.inputMode === 'voice'} onClick={() => setMode('voice')}>语音输入</button>
      <button className={draft.inputMode === 'text' ? 'active' : ''} type="button" role="tab" aria-selected={draft.inputMode === 'text'} onClick={() => setMode('text')}>文字输入</button></div>
      <div className="editor-actions" aria-label="写作辅助"><button type="button" onClick={() => onDemo('chat')}>聊天引导</button><button type="button" onClick={() => onDemo('optimize')}>文章优化</button></div>
    </div>
    {draft.inputMode === 'voice' && <VoicePanel pending={draft.pendingVoice}
      onPending={text => update({ ...draftRef.current, pendingVoice: text })}
      onEdit={() => update({ ...draft, segmentEdit: { id: 'pending', text: draft.pendingVoice } })}
      onDone={() => update(completeVoice(draftRef.current))} />}</footer>
  </>;
}
