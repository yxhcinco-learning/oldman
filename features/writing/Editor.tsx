import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { Dialog } from '../../components/Dialog';
import { BackIcon } from '../../components/Icons';
import { WritingToolbar } from '../../components/WritingControls';
import { articleText, effectiveSegments, completeSegment, completeVoice, type Draft, type InputMode } from '../../lib/domain/writing';
import { caretFromPoint, textOffsetAtCaret } from '../../lib/pointCaret';
import { VoicePanel } from '../speech/VoicePanel';

const BODY_PLACEHOLDER = '从想说的一句话开始……';
const OPTIMIZE_TIP_KEY = 'suiyue-optimize-tip-v1';
const OPTIMIZE_TIP_LENGTH = 80;
const BODY_LONG_PRESS_MS = 600;
const BODY_LONG_PRESS_MOVE_PX = 10;
const optimizeBodyLength = (draft: Draft) => [...articleText(effectiveSegments(draft)).replace(/\s/g, '')].length;
function textOffsetFromPoint(root: HTMLElement, segments: Draft['segments'], clientX: number, clientY: number) {
  const fullLength = articleText(segments).length;
  const caret = caretFromPoint(root.ownerDocument, clientX, clientY);
  if (!caret) return fullLength;

  const offsetElement = caret.offsetNode.nodeType === 1 ? caret.offsetNode as Element : caret.offsetNode.parentElement;
  const paragraph = offsetElement?.closest<HTMLElement>('.writing-paragraph');
  if (!paragraph || !root.contains(paragraph)) return fullLength;
  const segmentIndex = Number(paragraph.dataset.segmentIndex);
  const segment = segments[segmentIndex];
  if (!Number.isInteger(segmentIndex) || !segment) return fullLength;

  const paragraphOffset = textOffsetAtCaret(paragraph, caret);
  if (paragraphOffset === null) return fullLength;
  return segments.slice(0, segmentIndex).reduce((length, item) => length + item.text.length + 2, 0) + Math.min(paragraphOffset, segment.text.length);
}
type BodyLongPress = {
  pointerId: number; pointerType: string; clientX: number; clientY: number; startedAt: number; moved: boolean;
  root: HTMLDivElement; timer: number | null; cleanupTimer: number | null;
};
function hasSeenOptimizeTip() {
  try { return localStorage.getItem(OPTIMIZE_TIP_KEY) === 'yes'; }
  catch { return false; }
}

export function Editor({ draft, update, onSave, onBack, onAssistant, saveStatus }: {
  draft: Draft; update: (draft: Draft) => void; onSave: () => void; onBack: () => void;
  onAssistant: (entry: 'chat' | 'optimize') => void; saveStatus: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleEditInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const migratedEdit = useRef('');
  const focusAfterMigration = useRef(false);
  const lastBodyTap = useRef(0);
  const segmentTextarea = useRef<HTMLTextAreaElement>(null);
  const pendingEditCaret = useRef<number | null>(null);
  const bodyLongPress = useRef<BodyLongPress | null>(null);
  const [voiceCollapsed, setVoiceCollapsed] = useState(false);
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const [titleEditorOpen, setTitleEditorOpen] = useState(false);
  const [titleEditValue, setTitleEditValue] = useState(draft.title);
  const [showOptimizeTip, setShowOptimizeTip] = useState(() => !hasSeenOptimizeTip() && optimizeBodyLength(draft) >= OPTIMIZE_TIP_LENGTH);
  const optimizeTipHandled = useRef(showOptimizeTip || hasSeenOptimizeTip());
  // Event callbacks always read the currently rendered document.
  useLayoutEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!showOptimizeTip) return;
    try { localStorage.setItem(OPTIMIZE_TIP_KEY, 'yes'); } catch { /* The current mount still remembers it. */ }
  }, [showOptimizeTip]);
  useEffect(() => {
    if (!chatUnavailable) return;
    const timer = setTimeout(() => setChatUnavailable(false), 3000);
    return () => clearTimeout(timer);
  }, [chatUnavailable]);
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
  useLayoutEffect(() => {
    if (draft.segmentEdit?.id !== 'pending' || pendingEditCaret.current === null) return;
    const body = segmentTextarea.current;
    if (!body) return;
    const caret = Math.max(0, Math.min(pendingEditCaret.current, body.value.length));
    pendingEditCaret.current = null;
    body.setSelectionRange(caret, caret);
    body.focus({ preventScroll: true });
    body.setSelectionRange(caret, caret);
  }, [draft.segmentEdit?.id]);
  useEffect(() => () => {
    const gesture = bodyLongPress.current;
    if (gesture?.timer != null) window.clearTimeout(gesture.timer);
    if (gesture?.cleanupTimer != null) window.clearTimeout(gesture.cleanupTimer);
  }, []);
  const focusTextBody = (caretOffset?: number) => {
    const body = textarea.current;
    if (!body) return;
    const caret = caretOffset === undefined ? undefined : Math.max(0, Math.min(caretOffset, body.value.length));
    if (caret !== undefined) body.setSelectionRange(caret, caret);
    body.focus({ preventScroll: true });
    if (caret !== undefined) body.setSelectionRange(caret, caret);
  };
  const setMode = (mode: InputMode, focusBody = true, caretOffset?: number) => {
    if (mode === draft.inputMode) {
      if (mode === 'text' && focusBody) focusTextBody(caretOffset);
      else setVoiceCollapsed(false);
      return;
    }
    const segments = effectiveSegments(draft);
    flushSync(() => updateDraft({ ...draft, segments, textDraft: articleText(segments), inputMode: mode }));
    if (mode === 'voice') setVoiceCollapsed(false);
    if (mode === 'text' && focusBody) focusTextBody(caretOffset);
  };
  const openFromBody = (event: ReactMouseEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (lastBodyTap.current > 0 && now - lastBodyTap.current <= 350) {
      lastBodyTap.current = 0;
      const caretOffset = textOffsetFromPoint(event.currentTarget, draft.segments, event.clientX, event.clientY);
      setMode('text', true, caretOffset);
      return;
    }
    lastBodyTap.current = now;
    if (voiceCollapsed) setVoiceCollapsed(false);
  };
  const openTextAtBodyPoint = (root: HTMLDivElement, clientX: number, clientY: number) => {
    lastBodyTap.current = 0;
    const caretOffset = textOffsetFromPoint(root, draft.segments, clientX, clientY);
    setMode('text', true, caretOffset);
  };
  const clearBodyLongPress = (keepForContextMenu = false) => {
    const gesture = bodyLongPress.current;
    if (!gesture) return;
    if (gesture.timer !== null) window.clearTimeout(gesture.timer);
    gesture.timer = null;
    if (!keepForContextMenu) {
      if (gesture.cleanupTimer !== null) window.clearTimeout(gesture.cleanupTimer);
      bodyLongPress.current = null;
      return;
    }
    gesture.cleanupTimer = window.setTimeout(() => {
      if (bodyLongPress.current === gesture) bodyLongPress.current = null;
    }, 1000);
  };
  const startBodyLongPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearBodyLongPress();
    if (event.isPrimary === false || event.button !== 0 || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    const gesture: BodyLongPress = {
      pointerId: event.pointerId, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY,
      startedAt: performance.now(), moved: false, root: event.currentTarget, timer: null, cleanupTimer: null,
    };
    gesture.timer = window.setTimeout(() => {
      if (bodyLongPress.current !== gesture || gesture.moved) return;
      bodyLongPress.current = null;
      openTextAtBodyPoint(gesture.root, gesture.clientX, gesture.clientY);
    }, BODY_LONG_PRESS_MS);
    bodyLongPress.current = gesture;
  };
  const moveBodyLongPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = bodyLongPress.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) <= BODY_LONG_PRESS_MOVE_PX) return;
    gesture.moved = true;
    clearBodyLongPress();
  };
  const endBodyLongPress = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = bodyLongPress.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const contextMenuMayFollow = cancelled && !gesture.moved && performance.now() - gesture.startedAt >= BODY_LONG_PRESS_MS - 150;
    clearBodyLongPress(contextMenuMayFollow);
  };
  const openFromNativeLongPress = (event: ReactMouseEvent<HTMLDivElement>) => {
    const gesture = bodyLongPress.current;
    if (!gesture || gesture.moved || (gesture.pointerType !== 'touch' && gesture.pointerType !== 'pen')) return;
    clearBodyLongPress();
    openTextAtBodyPoint(event.currentTarget, gesture.clientX, gesture.clientY);
  };
  if (draft.segmentEdit?.id === 'pending') return <>
    <header className="topbar"><span className="topbar-spacer" /><div><strong>修改语音文字</strong></div><button className="text-button pending-edit-cancel" type="button" aria-label="取消修改" onClick={() => updateDraft({ ...draft, segmentEdit: null })}>取消</button></header>
    <div className="segment-editor-wrap pending-segment-editor-wrap"><textarea ref={segmentTextarea} autoFocus className="segment-editor" aria-label="段落内容" maxLength={1_000_000} value={draft.segmentEdit.text} onChange={e => updateDraft({ ...draft, segmentEdit: { ...draft.segmentEdit!, text: e.target.value } })} /><p>{[...draft.segmentEdit.text.replace(/\s/g, '')].length} 字</p></div>
    <footer className="simple-footer pending-segment-editor-footer"><button className="primary-button" type="button" onClick={() => updateDraft(completeSegment(draft))}>完成修改</button></footer>
  </>;
  return <>
    <header className="topbar editor-topbar"><button className="icon-button" type="button" aria-label="返回作品" onClick={onBack}><BackIcon /></button><button className={`editor-title-button${draft.title.trim() ? '' : ' empty'}`} type="button" aria-label="编辑文章标题" onClick={() => { setTitleEditValue(draft.title); setTitleEditorOpen(true); }}><strong>{draft.title.trim() || '点击编辑标题'}</strong></button><button className="text-button save-text" type="button" aria-describedby="save-status" onClick={onSave}>{saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '重试' : '保存'}</button></header>
    <span id="save-status" className="visually-hidden" role="status">{saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存到本机' : saveStatus === 'error' ? '尚未保存，请先备份' : '内容仅保存在本机'}</span>
    <div className="editor-scroll writing-canvas">
      {draft.inputMode === 'text' ? <textarea ref={textarea} className="full-text-editor writing-body" value={draft.textDraft} maxLength={1_000_000} onChange={e => updateDraft({ ...draft, textDraft: e.target.value })} placeholder={BODY_PLACEHOLDER} aria-label="文章正文" inputMode="text" autoCapitalize="sentences" /> : <div className="full-text-editor writing-body writing-preview" role="group" aria-label="文章正文" tabIndex={0}
        onClick={openFromBody}
        onPointerDown={startBodyLongPress}
        onPointerMove={moveBodyLongPress}
        onPointerUp={event => endBodyLongPress(event)}
        onPointerCancel={event => endBodyLongPress(event, true)}
        onPointerLeave={event => endBodyLongPress(event)}
        onContextMenu={openFromNativeLongPress}
        onKeyDown={event => { if (voiceCollapsed && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setVoiceCollapsed(false); } }}>
        {!draft.segments.length && <p className="writing-placeholder">{BODY_PLACEHOLDER}</p>}
        {draft.segments.map((s, index) => <p key={s.id} className="writing-paragraph" data-segment-index={index}><span>{s.text}</span></p>)}
      </div>}
    </div>
    <footer className={`editor-dock ${draft.inputMode}${draft.inputMode === 'voice' && voiceCollapsed ? ' collapsed' : ''}`}><WritingToolbar mode={draft.inputMode} onMode={setMode} onChat={() => setChatUnavailable(true)}
      onOptimize={() => { dismissOptimizeTip(); onAssistant('optimize'); }} showOptimizeTip={showOptimizeTip} />
    {draft.inputMode === 'voice' && !voiceCollapsed && <VoicePanel pending={draft.pendingVoice}
      onPending={text => updateDraft({ ...draftRef.current, pendingVoice: text })}
      onEdit={caretOffset => { pendingEditCaret.current = caretOffset; updateDraft({ ...draft, segmentEdit: { id: 'pending', text: draft.pendingVoice } }); }}
      onDone={() => updateDraft(completeVoice(draftRef.current))}
      onCollapse={() => { lastBodyTap.current = 0; setVoiceCollapsed(true); }} />}</footer>
    {chatUnavailable && <p className="toast editor-feature-toast" role="status">聊天功能暂未开放</p>}
    {titleEditorOpen && <Dialog title="编辑标题" className="title-edit-dialog" initialFocusRef={titleEditInput} onClose={() => setTitleEditorOpen(false)}>
      <form className="title-edit-form" onSubmit={event => { event.preventDefault(); updateDraft({ ...draftRef.current, title: titleEditValue }); setTitleEditorOpen(false); }}>
        <label htmlFor="article-title-edit">文章标题</label>
        <input ref={titleEditInput} id="article-title-edit" className="title-edit-input" type="text" inputMode="text" autoComplete="off" maxLength={120} value={titleEditValue} onChange={event => setTitleEditValue(event.target.value)} placeholder="输入标题" />
        <div className="title-edit-actions"><button type="button" onClick={() => setTitleEditorOpen(false)}>取消</button><button type="submit" className="primary-button">完成</button></div>
      </form>
    </Dialog>}
  </>;
}
