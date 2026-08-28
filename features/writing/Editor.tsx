import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { BackIcon, Icon } from '../../components/Icons';
import { WritingToolbar } from '../../components/WritingControls';
import { articleText, effectiveSegments, completeSegment, completeVoice, type Draft, type InputMode } from '../../lib/domain/writing';
import { VoicePanel } from '../speech/VoicePanel';

const BODY_PLACEHOLDER = '从想说的一句话开始……';

export function Editor({ draft, update, onSave, onBack, onAssistant, saveStatus }: {
  draft: Draft; update: (draft: Draft) => void; onSave: () => void; onBack: () => void;
  onAssistant: (entry: 'chat' | 'optimize') => void; saveStatus: string;
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
    <header className="topbar"><button className="icon-button" type="button" aria-label="返回文章" onClick={() => update(completeSegment(draft))}><BackIcon /></button><div><strong>编辑这一段</strong></div><span className="topbar-spacer" /></header>
    <div className="segment-editor-wrap"><div className="segment-note"><Icon name="pen" /><span>让这段话，更像您想说的。</span></div><textarea autoFocus className="segment-editor" aria-label="段落内容" maxLength={1_000_000} value={draft.segmentEdit.text} onChange={e => update({ ...draft, segmentEdit: { ...draft.segmentEdit!, text: e.target.value } })} /><p>{[...draft.segmentEdit.text.replace(/\s/g, '')].length} 字</p></div>
    <footer className="simple-footer"><button className="primary-button" type="button" onClick={() => update(completeSegment(draft))}>完成修改</button></footer>
  </>;
  return <>
    <header className="topbar editor-topbar"><button className="icon-button" type="button" aria-label="返回作品" onClick={onBack}><BackIcon /></button><div><strong>开始写作</strong></div><button className="text-button save-text" type="button" aria-describedby="save-status" onClick={onSave}>{saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '重试' : '保存'}</button></header>
    <span id="save-status" className="visually-hidden" role="status">{saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存到本机' : saveStatus === 'error' ? '尚未保存，请先备份' : '内容仅保存在本机'}</span>
    <div className="editor-scroll writing-canvas">
      <input className="title-input" maxLength={120} value={draft.title} onChange={e => update({ ...draft, title: e.target.value })} placeholder="输入标题" aria-label="文章标题" />
      {draft.inputMode === 'text' ? <textarea ref={textarea} className="full-text-editor writing-body" value={draft.textDraft} maxLength={1_000_000} onChange={e => update({ ...draft, textDraft: e.target.value })} placeholder={BODY_PLACEHOLDER} aria-label="文章正文" inputMode="text" autoCapitalize="sentences" /> : <div className="full-text-editor writing-body writing-preview" role="group" aria-label="文章正文">
        {!draft.segments.length && <p className="writing-placeholder">{BODY_PLACEHOLDER}</p>}
        {draft.segments.map((s, i) => <button key={s.id} className="writing-paragraph" type="button" aria-label={`编辑第 ${i + 1} 段`} onClick={() => update({ ...draft, segmentEdit: { ...s } })}><span>{s.text}</span></button>)}
      </div>}
    </div>
    <footer className={`editor-dock ${draft.inputMode}`}><WritingToolbar mode={draft.inputMode} onMode={setMode} onChat={() => onAssistant('chat')} onOptimize={() => onAssistant('optimize')} />
    {draft.inputMode === 'voice' && <VoicePanel pending={draft.pendingVoice}
      onPending={text => update({ ...draftRef.current, pendingVoice: text })}
      onEdit={() => update({ ...draft, segmentEdit: { id: 'pending', text: draft.pendingVoice } })}
      onDone={() => update(completeVoice(draftRef.current))} />}</footer>
  </>;
}
