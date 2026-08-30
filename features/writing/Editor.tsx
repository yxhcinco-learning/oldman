import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BackIcon, Icon } from '../../components/Icons';
import { WritingToolbar } from '../../components/WritingControls';
import { articleText, effectiveSegments, completeSegment, completeVoice, type Draft, type InputMode } from '../../lib/domain/writing';
import { VoicePanel } from '../speech/VoicePanel';

const BODY_PLACEHOLDER = '从想说的一句话开始……';
const OPTIMIZE_TIP_KEY = 'suiyue-optimize-tip-v1';
const OPTIMIZE_TIP_LENGTH = 80;
const optimizeBodyLength = (draft: Draft) => [...articleText(effectiveSegments(draft)).replace(/\s/g, '')].length;
function hasSeenOptimizeTip() {
  try { return localStorage.getItem(OPTIMIZE_TIP_KEY) === 'yes'; }
  catch { return false; }
}

export function Editor({ draft, update, onSave, onBack, onAssistant, saveStatus }: {
  draft: Draft; update: (draft: Draft) => void; onSave: () => void; onBack: () => void;
  onAssistant: (entry: 'chat' | 'optimize') => void; saveStatus: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  const migratedEdit = useRef('');
  const focusAfterMigration = useRef(false);
  const lastBodyTap = useRef(0);
  const [voiceCollapsed, setVoiceCollapsed] = useState(false);
  const [showOptimizeTip, setShowOptimizeTip] = useState(() => !hasSeenOptimizeTip() && optimizeBodyLength(draft) >= OPTIMIZE_TIP_LENGTH);
  const optimizeTipHandled = useRef(showOptimizeTip || hasSeenOptimizeTip());
  // Event callbacks always read the currently rendered document.
  useLayoutEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!showOptimizeTip) return;
    try { localStorage.setItem(OPTIMIZE_TIP_KEY, 'yes'); } catch { /* The current mount still remembers it. */ }
  }, [showOptimizeTip]);
  useEffect(() => {
    if (!showOptimizeTip) return;
    const timer = setTimeout(() => setShowOptimizeTip(false), 6000);
    return () => clearTimeout(timer);
  }, [showOptimizeTip]);
  const dismissOptimizeTip = () => {
    optimizeTipHandled.current = true;
    setShowOptimizeTip(false);
    try { localStorage.setItem(OPTIMIZE_TIP_KEY, 'yes'); } catch { /* The current mount still remembers it. */ }
  };
  const updateDraft = (next: Draft) => {
    if (!optimizeTipHandled.current && optimizeBodyLength(next) >= OPTIMIZE_TIP_LENGTH) {
      optimizeTipHandled.current = true;
      setShowOptimizeTip(true);
    }
    update(next);
  };
  useEffect(() => {
    const edit = draft.segmentEdit;
    if (!edit || edit.id === 'pending') { migratedEdit.current = ''; return; }
    const signature = `${edit.id}\u0000${edit.text}`;
    if (migratedEdit.current === signature) return;
    migratedEdit.current = signature;
    focusAfterMigration.current = true;
    const completed = completeSegment(draft);
    const segments = effectiveSegments(completed);
    update({ ...completed, segments, textDraft: articleText(segments), inputMode: 'text' });
  }, [draft, update]);
  useEffect(() => {
    if (!focusAfterMigration.current || draft.inputMode !== 'text' || draft.segmentEdit) return;
    focusAfterMigration.current = false;
    textarea.current?.focus({ preventScroll: true });
  }, [draft.inputMode, draft.segmentEdit]);
  const setMode = (mode: InputMode) => {
    if (mode === draft.inputMode) {
      if (mode === 'text') textarea.current?.focus();
      else setVoiceCollapsed(false);
      return;
    }
    const segments = effectiveSegments(draft);
    flushSync(() => updateDraft({ ...draft, segments, textDraft: articleText(segments), inputMode: mode }));
    if (mode === 'voice') setVoiceCollapsed(false);
    if (mode === 'text') textarea.current?.focus({ preventScroll: true });
  };
  const openFromBody = () => {
    const now = performance.now();
    if (lastBodyTap.current > 0 && now - lastBodyTap.current <= 350) {
      lastBodyTap.current = 0;
      setMode('text');
      return;
    }
    lastBodyTap.current = now;
    if (voiceCollapsed) setVoiceCollapsed(false);
  };
  if (draft.segmentEdit?.id === 'pending') return <>
    <header className="topbar"><button className="icon-button" type="button" aria-label="返回文章" onClick={() => updateDraft(completeSegment(draft))}><BackIcon /></button><div><strong>修改语音文字</strong></div><span className="topbar-spacer" /></header>
    <div className="segment-editor-wrap"><div className="segment-note"><Icon name="pen" /><span>让这段话，更像您想说的。</span></div><textarea autoFocus className="segment-editor" aria-label="段落内容" maxLength={1_000_000} value={draft.segmentEdit.text} onChange={e => updateDraft({ ...draft, segmentEdit: { ...draft.segmentEdit!, text: e.target.value } })} /><p>{[...draft.segmentEdit.text.replace(/\s/g, '')].length} 字</p></div>
    <footer className="simple-footer"><button className="primary-button" type="button" onClick={() => updateDraft(completeSegment(draft))}>完成修改</button></footer>
  </>;
  return <>
    <header className="topbar editor-topbar"><button className="icon-button" type="button" aria-label="返回作品" onClick={onBack}><BackIcon /></button><div><strong>开始写作</strong></div><button className="text-button save-text" type="button" aria-describedby="save-status" onClick={onSave}>{saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '重试' : '保存'}</button></header>
    <span id="save-status" className="visually-hidden" role="status">{saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存到本机' : saveStatus === 'error' ? '尚未保存，请先备份' : '内容仅保存在本机'}</span>
    <div className="editor-scroll writing-canvas">
      <input className="title-input" maxLength={120} value={draft.title} onChange={e => updateDraft({ ...draft, title: e.target.value })} placeholder="输入标题" aria-label="文章标题" />
      {draft.inputMode === 'text' ? <textarea ref={textarea} className="full-text-editor writing-body" value={draft.textDraft} maxLength={1_000_000} onChange={e => updateDraft({ ...draft, textDraft: e.target.value })} placeholder={BODY_PLACEHOLDER} aria-label="文章正文" inputMode="text" autoCapitalize="sentences" /> : <div className="full-text-editor writing-body writing-preview" role="group" aria-label="文章正文" tabIndex={0}
        onClick={openFromBody}
        onKeyDown={event => { if (voiceCollapsed && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setVoiceCollapsed(false); } }}>
        {!draft.segments.length && <p className="writing-placeholder">{BODY_PLACEHOLDER}</p>}
        {draft.segments.map(s => <p key={s.id} className="writing-paragraph"><span>{s.text}</span></p>)}
      </div>}
    </div>
    <footer className={`editor-dock ${draft.inputMode}${draft.inputMode === 'voice' && voiceCollapsed ? ' collapsed' : ''}`}><WritingToolbar mode={draft.inputMode} onMode={setMode} onChat={() => onAssistant('chat')}
      onOptimize={() => { dismissOptimizeTip(); onAssistant('optimize'); }} showOptimizeTip={showOptimizeTip} />
    {draft.inputMode === 'voice' && !voiceCollapsed && <VoicePanel pending={draft.pendingVoice}
      onPending={text => updateDraft({ ...draftRef.current, pendingVoice: text })}
      onEdit={() => updateDraft({ ...draft, segmentEdit: { id: 'pending', text: draft.pendingVoice } })}
      onDone={() => updateDraft(completeVoice(draftRef.current))}
      onCollapse={() => { lastBodyTap.current = 0; setVoiceCollapsed(true); }} />}</footer>
  </>;
}
