'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import {
  VOICE_PHRASES,
  articleText,
  buildChatIntro,
  getChatReply,
  getChatUserPhrase,
  organizeChatIntoSegments,
  optimizedSegments,
  splitDraft,
  type ChatMessage,
  type Segment,
} from './mock-data';
import { type Draft, effectiveSegments } from '../../lib/domain/writing';
import { reducer, initialState, type AppState, type RecordingContext, type InputMode } from './demo-state';
import { MemoryIllustration, OptimizationSheet } from './OptimizationSheet';
import { BackIcon, Icon, MicIcon } from '../../components/Icons';
import { VoiceIdle, WritingToolbar } from '../../components/WritingControls';

function Waveform({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`waveform ${compact ? 'compact' : ''}`} aria-hidden="true">
      {[3, 6, 9, 5, 11, 7, 4, 8, 5, 10, 6, 3].map((height, index) => (
        <i key={`${height}-${index}`} style={{ '--wave-height': `${height * (compact ? 1.1 : 1.8)}px`, '--wave-delay': `${index * 55}ms` } as CSSProperties} />
      ))}
    </span>
  );
}

export function DemoApp({ source, entry, onExit }: { source: Draft; entry: 'chat' | 'optimize' | 'editor'; onExit: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const segments = structuredClone(effectiveSegments(source));
    return { ...initialState, title: source.title, segments, textDraft: articleText(segments), pendingVoice: source.pendingVoice,
      screen: entry === 'chat' ? 'chat' as const : 'editor' as const,
      messages: entry === 'chat' ? buildChatIntro(segments) : [],
      optimizeSheet: entry === 'optimize' ? 'menu' as const : null };
  });
  const stateRef = useRef(state);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecording = useRef(false);
  const recordingContext = useRef<RecordingContext>(null);
  const liveText = useRef('');
  const prefixText = useRef('');
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const liveTranscriptRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state.toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => dispatch({ type: 'patch', patch: { toast: null } }), 2600);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [state.toast]);

  useEffect(() => {
    if (state.screen !== 'chat' || !chatScrollRef.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [state.screen, state.messages, state.aiTyping]);

  useEffect(() => {
    if (state.recordingContext !== 'editor' || !liveTranscriptRef.current) return;
    liveTranscriptRef.current.scrollTop = liveTranscriptRef.current.scrollHeight;
  }, [state.liveVoice, state.recordingContext]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (transcriptTimer.current) clearInterval(transcriptTimer.current);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const patch = useCallback((next: Partial<AppState>) => {
    dispatch({ type: 'patch', patch: next });
  }, []);

  function showToast(message: string) {
    patch({ toast: message });
  }

  function clearRecordingTimers() {
    if (transcriptTimer.current) clearInterval(transcriptTimer.current);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    transcriptTimer.current = null;
    elapsedTimer.current = null;
  }

  function beginRecording(context: Exclude<RecordingContext, null>) {
    if (isRecording.current) return;
    const current = stateRef.current;
    const userMessageCount = current.messages.filter((message) => message.role === 'user').length;
    const phrase = context === 'chat'
      ? getChatUserPhrase(current.segments, userMessageCount)
      : VOICE_PHRASES[(current.segments.length + (current.pendingVoice ? 1 : 0)) % VOICE_PHRASES.length];

    isRecording.current = true;
    recordingContext.current = context;
    prefixText.current = context === 'editor' ? current.pendingVoice : '';
    liveText.current = phrase.slice(0, 1);
    let cursor = 1;
    let seconds = 0;
    patch({
      recordingContext: context,
      voiceState: 'recording',
      liveVoice: liveText.current,
      recordingElapsed: 0,
    });

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(24);
    transcriptTimer.current = setInterval(() => {
      cursor = Math.min(cursor + 2, phrase.length);
      liveText.current = phrase.slice(0, cursor);
      patch({ liveVoice: liveText.current });
      if (cursor >= phrase.length && transcriptTimer.current) {
        clearInterval(transcriptTimer.current);
        transcriptTimer.current = null;
      }
    }, 165);
    elapsedTimer.current = setInterval(() => {
      seconds += 1;
      patch({ recordingElapsed: seconds });
    }, 1000);
  }

  function finishRecording() {
    if (!isRecording.current) return;
    clearRecordingTimers();
    isRecording.current = false;
    const context = recordingContext.current;
    const recognized = liveText.current.trim();
    recordingContext.current = null;

    if (!recognized) {
      patch({ voiceState: prefixText.current ? 'review' : 'idle', recordingContext: null, liveVoice: '' });
      showToast('这次没有听清，再说一次吧');
      return;
    }

    if (context === 'editor') {
      const combined = [prefixText.current.trim(), recognized].filter(Boolean).join('');
      patch({ pendingVoice: combined, liveVoice: '', voiceState: 'review', recordingContext: null });
      return;
    }

    const current = stateRef.current;
    const userCount = current.messages.filter((message) => message.role === 'user').length;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text: recognized };
    patch({
      messages: [...current.messages, userMessage],
      liveVoice: '',
      voiceState: 'idle',
      recordingContext: null,
      aiTyping: true,
    });
    aiTimer.current = setTimeout(() => {
      const latest = stateRef.current;
      const reply: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: getChatReply(latest.segments, userCount),
      };
      patch({ messages: [...latest.messages, reply], aiTyping: false });
    }, 900);
  }

  function cancelRecording() {
    if (!isRecording.current) return;
    clearRecordingTimers();
    isRecording.current = false;
    recordingContext.current = null;
    patch({
      recordingContext: null,
      liveVoice: '',
      voiceState: prefixText.current ? 'review' : 'idle',
      recordingElapsed: 0,
    });
    showToast('本次输入已取消');
  }

  function handleHoldStart(context: Exclude<RecordingContext, null>, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      beginRecording(context);
    }, 180);
  }

  function handleHoldEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      showToast('请按住按钮，再开始说话');
      return;
    }
    finishRecording();
  }

  function handleHoldCancel() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    cancelRecording();
  }

  function handleHoldKeyDown(context: Exclude<RecordingContext, null>, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      beginRecording(context);
    }
  }

  function handleHoldKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      finishRecording();
    }
  }

  function commitTextDraft() {
    const segments = splitDraft(stateRef.current.textDraft);
    dispatch({ type: 'replace-segments', segments });
    return segments;
  }

  function changeMode(mode: InputMode) {
    if (mode === state.inputMode) return;
    if (mode === 'voice') {
      commitTextDraft();
      patch({ inputMode: 'voice' });
      return;
    }

    flushSync(() => {
      dispatch({
        type: 'patch',
        patch: { inputMode: 'text', textDraft: articleText(stateRef.current.segments) },
      });
    });
    const editor = textEditorRef.current;
    if (editor) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function openChat() {
    const segments = state.inputMode === 'text' ? splitDraft(state.textDraft) : state.segments;
    if (state.inputMode === 'text') dispatch({ type: 'replace-segments', segments });
    patch({ screen: 'chat', messages: buildChatIntro(segments), aiTyping: false, voiceState: 'idle' });
  }

  function finishChat() {
    if (aiTimer.current) {
      clearTimeout(aiTimer.current);
      aiTimer.current = null;
    }
    const additions = organizeChatIntoSegments(state.messages);
    if (!additions.length) {
      patch({ screen: 'editor', aiTyping: false, toast: '还没有新的回答，正文保持不变' });
      return;
    }
    const nextSegments = [...state.segments, ...additions];
    dispatch({ type: 'replace-segments', segments: nextSegments });
    patch({
      screen: 'editor',
      aiTyping: false,
      messages: [],
      inputMode: 'voice',
      title: state.title.trim() || '第一次去远方',
      toast: `已把 ${additions.length} 段聊天内容整理进正文`,
    });
  }

  const saveWork = onExit;

  function applyOptimization() {
    if (state.optimizeChoice.startsWith('配图：')) {
      patch({ previousSegments: state.segments, previousIllustration: state.illustration, illustration: state.optimizeChoice.replace('配图：', ''), inputMode: 'voice', optimizeSheet: null, toast: '配图已经放进文章里了' });
      return;
    }
    const source = state.segments;
    const next = optimizedSegments(source, state.optimizeChoice);
    dispatch({ type: 'replace-segments', segments: next, previous: source });
    patch({ previousIllustration: state.illustration, optimizeSheet: null, toast: null });
  }

  function undoOptimization() {
    if (!state.previousSegments) return;
    dispatch({ type: 'replace-segments', segments: state.previousSegments, previous: null });
    patch({ illustration: state.previousIllustration, previousIllustration: null, toast: '已经恢复到优化前的内容' });
  }

  function openSegment(segment: Segment) {
    patch({ screen: 'segment-edit', editSegmentId: segment.id, editText: segment.text });
  }

  const recordingCopy = [state.pendingVoice, state.liveVoice].filter(Boolean).join('');

  function renderToast() {
    const placement = state.screen === 'chat'
        ? 'chat'
        : state.screen === 'segment-edit'
          ? 'segment'
          : `editor ${state.inputMode}`;
    return state.toast ? <div className={`toast ${placement}`} role="status">{state.toast}</div> : null;
  }

  if (state.screen === 'segment-edit') {
    return (
      <main className="stage">
        <section className="phone-shell app-view edit-segment-screen" aria-label="编辑这一段">
          <div className="demo-banner"><span>演示模式 · 不影响作品</span><button type="button" onClick={onExit}>退出演示</button></div>
          <header className="topbar">
            <button className="icon-button" type="button" aria-label="返回文章" onClick={() => patch({ screen: 'editor' })}><BackIcon /></button>
            <div><strong>编辑这一段</strong></div>
            <span className="topbar-spacer" />
          </header>
          <div className="segment-editor-wrap">
            <div className="segment-note"><Icon name="pen" /><span>让这段话，更像您想说的。</span></div>
            <textarea
              autoFocus
              className="segment-editor"
              value={state.editText}
              onChange={(event) => patch({ editText: event.target.value })}
              aria-label="段落内容"
            />
            <p>{state.editText.replace(/\s/g, '').length} 字</p>
          </div>
          <footer className="simple-footer">
            <button className="primary-button" type="button" onClick={() => {
              if (!state.editSegmentId || !state.editText.trim()) return;
              if (state.editSegmentId === 'pending') {
                patch({ pendingVoice: state.editText.trim(), screen: 'editor', editSegmentId: null });
              } else {
                dispatch({ type: 'update-segment', id: state.editSegmentId, text: state.editText.trim() });
              }
            }}>完成修改</button>
          </footer>
          {renderToast()}
        </section>
      </main>
    );
  }

  if (state.screen === 'chat') {
    return (
      <main className="stage">
        <section className="phone-shell app-view chat-screen" aria-label="和小文聊一聊">
          <div className="demo-banner"><span>演示模式 · 不影响作品</span><button type="button" onClick={onExit}>退出演示</button></div>
          <header className="topbar chat-topbar">
            <button className="icon-button" type="button" aria-label="返回文章" onClick={() => patch({ screen: 'editor', voiceState: 'idle' })}><BackIcon /></button>
            <div><strong>和小文聊一聊</strong><small><i /> 陪您慢慢写</small></div>
            <button className="text-button" type="button" onClick={finishChat}>完成</button>
          </header>

          <div className="chat-scroll" ref={chatScrollRef}>
            <div className="chat-day"><span />从一句话开始<span /></div>
            {state.messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="assistant-avatar" aria-hidden="true"><Icon name="leaf" /></span>}
                <div className="message-bubble">{message.text}</div>
              </div>
            ))}
            {state.aiTyping && (
              <div className="message-row assistant">
                <span className="assistant-avatar" aria-hidden="true"><Icon name="leaf" /></span>
                <div className="message-bubble typing"><i /><i /><i /></div>
              </div>
            )}
          </div>

          <footer className="chat-dock">
            <p>像聊天一样，说一句就好。</p>
            <button
              className="hold-to-talk"
              type="button"
              onPointerDown={(event) => handleHoldStart('chat', event)}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldCancel}
              onKeyDown={(event) => handleHoldKeyDown('chat', event)}
              onKeyUp={handleHoldKeyUp}
              onContextMenu={(event) => event.preventDefault()}
            ><MicIcon />按住说话</button>
          </footer>

          {state.recordingContext === 'chat' && (
            <div className="recording-overlay" role="status" aria-live="polite">
              <div className="recognition-card">
                <Waveform />
                <p>{state.liveVoice || '正在听…'}</p>
                <small>{state.recordingElapsed} 秒 · 正在转成文字</small>
              </div>
              <div className="release-panel"><MicIcon /><strong>松开发送</strong><span>我正在听您说</span></div>
            </div>
          )}
          {renderToast()}
        </section>
      </main>
    );
  }

  return (
    <main className="stage">
      <section className="phone-shell app-view editor-screen" aria-label="写文章">
          <div className="demo-banner"><span>演示模式 · 不影响作品</span><button type="button" onClick={onExit}>退出演示</button></div>
        <header className="topbar editor-topbar">
          <button className="icon-button" type="button" aria-label="返回作品" onClick={onExit}><BackIcon /></button>
          <div><strong>开始写作</strong></div>
          <button className="text-button save-text" type="button" onClick={saveWork}>结束演示</button>
        </header>

        <div className="editor-scroll writing-canvas">
          <input
            className="title-input"
            value={state.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="输入标题"
            aria-label="文章标题"
          />

          {state.inputMode === 'text' ? (
            <textarea
              ref={textEditorRef}
              className="full-text-editor writing-body"
              value={state.textDraft}
              onChange={(event) => patch({ textDraft: event.target.value })}
              placeholder="从想说的一句话开始……"
              aria-label="文章正文"
              inputMode="text"
              autoCapitalize="sentences"
            />
          ) : (
            <div className="full-text-editor writing-body writing-preview" role="group" aria-label="文章正文">
              {!state.segments.length && (
                <p className="writing-placeholder">从想说的一句话开始……</p>
              )}
              {state.segments.map((segment, index) => (
                <div className="writing-piece" key={segment.id}>
                  <button className="writing-paragraph" type="button" aria-label={`编辑第 ${index + 1} 段`} onClick={() => openSegment(segment)}>
                    <span>{segment.text}</span>
                  </button>
                  {index === 0 && state.illustration && <MemoryIllustration kind={state.illustration} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {state.previousSegments && (
          <div className="undo-bar"><span><Icon name="check" />{state.optimizeChoice.startsWith('配图：') ? '已添加文章配图' : '已应用优化'}</span><button type="button" onClick={undoOptimization}><Icon name="undo" />撤销</button></div>
        )}

        <footer className={`editor-dock ${state.inputMode}`}>
          <WritingToolbar mode={state.inputMode} onMode={changeMode} onAssistant={openChat} disabled={state.voiceState === 'recording'} />

          {state.inputMode === 'voice' && (
            <div className={`voice-panel ${state.voiceState}`}>
              <div className="transcript-stage">
                {state.voiceState === 'idle' && <VoiceIdle />}
                {state.voiceState === 'recording' && (
                  <div className="live-transcript">
                    <div className="transcript-meta"><Waveform compact /><span>正在聆听 · {state.recordingElapsed} 秒</span></div>
                    <p ref={liveTranscriptRef}>{recordingCopy}<i /></p>
                  </div>
                )}
                {state.voiceState === 'review' && (
                  <button className="pending-transcript" type="button" aria-label="点击修改刚刚识别的文字" onClick={() => {
                    const temporary: Segment = { id: 'pending', text: state.pendingVoice };
                    patch({ screen: 'segment-edit', editSegmentId: 'pending', editText: temporary.text });
                  }}>
                    <span className="transcript-meta"><span><Icon name="check" />已转成文字</span><Icon name="pen" /></span><p>{state.pendingVoice}</p>
                  </button>
                )}
              </div>

              <div className="voice-controls">
                {state.voiceState === 'review' ? (
                  <button className="voice-side danger" type="button" onClick={() => patch({ pendingVoice: '', voiceState: 'idle' })}>清空</button>
                ) : <span className="voice-side" />}
                <button
                  className={`mic-button ${state.voiceState === 'recording' ? 'pressed' : ''}`}
                  type="button"
                  aria-label="按住说话"
                  onPointerDown={(event) => handleHoldStart('editor', event)}
                  onPointerUp={handleHoldEnd}
                  onPointerCancel={handleHoldCancel}
                  onKeyDown={(event) => handleHoldKeyDown('editor', event)}
                  onKeyUp={handleHoldKeyUp}
                  onContextMenu={(event) => event.preventDefault()}
                ><MicIcon /></button>
                {state.voiceState === 'review' ? (
                  <button className="voice-side done" type="button" onClick={() => {
                    if (state.pendingVoice.trim()) dispatch({ type: 'add-segment', text: state.pendingVoice.trim() });
                  }}>完成</button>
                ) : <span className="voice-side" />}
              </div>
              <small className="continue-hint">{state.voiceState === 'recording' ? '松开，结束这一段' : state.voiceState === 'review' ? '还想补充？可以继续按住说' : '按住说话'}</small>
            </div>
          )}
        </footer>

        {state.optimizeSheet && <OptimizationSheet state={state} patch={patch} apply={applyOptimization} />}
        {renderToast()}
      </section>
    </main>
  );
}
