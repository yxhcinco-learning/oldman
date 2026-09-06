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
import { Icon, LetterDrawing, StoryDrawing } from './Visuals';
import {
  CHAT_REPLIES,
  CHAT_USER_PHRASES,
  CONTENT_TYPES,
  CUSTOM_PROMPTS,
  FORMAT_OPTIONS,
  INITIAL_WORKS,
  VOICE_PHRASES,
  WRITING_STYLES,
  articleText,
  buildChatIntro,
  countWords,
  organizeChatIntoSegments,
  optimizedSegments,
  splitDraft,
  type ChatMessage,
  type Segment,
  type Work,
} from './mock-data';

type Screen = 'home' | 'editor' | 'segment-edit' | 'chat';
type InputMode = 'voice' | 'text';
type VoiceState = 'idle' | 'recording' | 'review';
type RecordingContext = 'editor' | 'chat' | null;
type OptimizeSheet = null | 'menu' | 'content' | 'style' | 'format' | 'image' | 'custom' | 'result';

interface AppState {
  screen: Screen;
  works: Work[];
  currentWorkId: string | null;
  title: string;
  segments: Segment[];
  textDraft: string;
  inputMode: InputMode;
  voiceState: VoiceState;
  pendingVoice: string;
  liveVoice: string;
  recordingElapsed: number;
  recordingContext: RecordingContext;
  editSegmentId: string | null;
  editText: string;
  messages: ChatMessage[];
  aiTyping: boolean;
  optimizeSheet: OptimizeSheet;
  optimizeChoice: string;
  customPrompt: string;
  illustration: string | null;
  previousSegments: Segment[] | null;
  previousIllustration: string | null;
  toast: string | null;
}

type Action =
  | { type: 'patch'; patch: Partial<AppState> }
  | { type: 'new-work' }
  | { type: 'open-work'; work: Work }
  | { type: 'add-segment'; text: string }
  | { type: 'update-segment'; id: string; text: string }
  | { type: 'replace-segments'; segments: Segment[]; previous?: Segment[] | null };

const initialState: AppState = {
  screen: 'home',
  works: INITIAL_WORKS,
  currentWorkId: null,
  title: '',
  segments: [],
  textDraft: '',
  inputMode: 'voice',
  voiceState: 'idle',
  pendingVoice: '',
  liveVoice: '',
  recordingElapsed: 0,
  recordingContext: null,
  editSegmentId: null,
  editText: '',
  messages: [],
  aiTyping: false,
  optimizeSheet: null,
  optimizeChoice: '',
  customPrompt: '',
  illustration: null,
  previousSegments: null,
  previousIllustration: null,
  toast: null,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'new-work':
      return {
        ...initialState,
        works: state.works,
        screen: 'editor',
        toast: null,
      };
    case 'open-work':
      return {
        ...state,
        screen: 'editor',
        currentWorkId: action.work.id,
        title: action.work.title,
        segments: action.work.segments,
        textDraft: articleText(action.work.segments),
        inputMode: 'voice',
        voiceState: 'idle',
        pendingVoice: '',
        illustration: null,
        previousSegments: null,
      };
    case 'add-segment': {
      const segments = [...state.segments, { id: `voice-${Date.now()}`, text: action.text }];
      return { ...state, segments, textDraft: articleText(segments), pendingVoice: '', liveVoice: '', voiceState: 'idle' };
    }
    case 'update-segment': {
      const segments = state.segments.map((segment) => segment.id === action.id ? { ...segment, text: action.text } : segment).filter(segment => segment.text.trim());
      return { ...state, segments, textDraft: articleText(segments), screen: 'editor', editSegmentId: null };
    }
    case 'replace-segments':
      return {
        ...state,
        segments: action.segments,
        textDraft: articleText(action.segments),
        previousSegments: action.previous === undefined ? state.previousSegments : action.previous,
      };
    default:
      return state;
  }
}

function BackIcon() {
  return <Icon name="back" />;
}

function MicIcon() {
  return <Icon name="mic" className="mic-glyph" />;
}

function Waveform({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`waveform ${compact ? 'compact' : ''}`} aria-hidden="true">
      {[3, 6, 9, 5, 11, 7, 4, 8, 5, 10, 6, 3].map((height, index) => (
        <i key={`${height}-${index}`} style={{ '--wave-height': `${height * (compact ? 1.1 : 1.8)}px`, '--wave-delay': `${index * 55}ms` } as CSSProperties} />
      ))}
    </span>
  );
}

export default function DesignPreview() {
  const [state, dispatch] = useReducer(reducer, initialState);
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
  const transcriptRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [state.messages, state.aiTyping, state.screen]);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [state.liveVoice]);

  useEffect(() => {
    if (!state.toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => dispatch({ type: 'patch', patch: { toast: null } }), 2600);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [state.toast]);

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
      ? CHAT_USER_PHRASES[userMessageCount % CHAT_USER_PHRASES.length]
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
        text: CHAT_REPLIES[userCount % CHAT_REPLIES.length],
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

  function typeWithMockKeyboard(key: string) {
    const editor = textEditorRef.current;
    const currentText = stateRef.current.textDraft;
    let start = editor?.selectionStart ?? currentText.length;
    const end = editor?.selectionEnd ?? start;
    let inserted = key;

    if (key === 'backspace') {
      if (start === end && start > 0) start -= 1;
      inserted = '';
    } else if (key === 'space') {
      inserted = ' ';
    } else if (key === 'enter') {
      inserted = '\n';
    }

    const nextText = `${currentText.slice(0, start)}${inserted}${currentText.slice(end)}`;
    const nextCaret = start + inserted.length;
    flushSync(() => {
      dispatch({ type: 'patch', patch: { textDraft: nextText } });
    });
    editor?.focus({ preventScroll: true });
    editor?.setSelectionRange(nextCaret, nextCaret);
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
      title: state.title.trim() || '我十六岁那年',
      toast: `已把 ${additions.length} 段聊天内容整理进正文`,
    });
  }

  function saveWork() {
    const segments = state.inputMode === 'text' ? splitDraft(state.textDraft) : state.segments;
    const title = state.title.trim() || '未命名作品';
    const newWork: Work = {
      id: state.currentWorkId ?? `work-${Date.now()}`,
      mark: title.slice(0, 1),
      tone: 'rose',
      title,
      meta: '刚刚',
      status: '已保存',
      segments,
    };
    const works = state.currentWorkId
      ? state.works.map((work) => work.id === state.currentWorkId ? newWork : work)
      : [newWork, ...state.works];
    patch({ works, screen: 'home', currentWorkId: newWork.id, title, segments, toast: '已保存到本次预览' });
  }

  function openOptimization() {
    if (state.inputMode === 'text') commitTextDraft();
    patch({ optimizeSheet: 'menu' });
  }

  function applyOptimization() {
    if (state.optimizeChoice.startsWith('配图：')) {
      patch({ illustration: state.optimizeChoice.replace('配图：', ''), previousIllustration: state.illustration, previousSegments: state.segments, inputMode: 'voice', optimizeSheet: null, toast: '配图已放入文章' });
      return;
    }
    const source = state.segments;
    const next = optimizedSegments(source);
    dispatch({ type: 'replace-segments', segments: next, previous: source });
    patch({ previousIllustration: state.illustration, optimizeSheet: null, toast: `已按“${state.optimizeChoice || '您的要求'}”优化，可以撤销` });
  }

  function undoOptimization() {
    if (!state.previousSegments) return;
    dispatch({ type: 'replace-segments', segments: state.previousSegments, previous: null });
    patch({ illustration: state.previousIllustration, toast: '已恢复到优化前' });
  }

  function openSegment(segment: Segment) {
    patch({ screen: 'segment-edit', editSegmentId: segment.id, editText: segment.text });
  }

  const recordingCopy = [state.pendingVoice, state.liveVoice].filter(Boolean).join('');

  function renderToast() {
    return state.toast ? <div className="toast" role="status">{state.toast}</div> : null;
  }

  if (state.screen === 'home') {
    return (
      <main className="stage">
        <section className="phone-shell home-screen" aria-label="岁月有声写作应用">
          <div className="home-scroll">
            <div className="brand-row">
              <span className="brand"><Icon name="leaf" /><b>岁月有声</b></span>
              <button className="round-button" type="button" aria-label="更多选项" onClick={() => showToast('设计预览 · 所有内容仅保留在本次页面中')}><Icon name="more" /></button>
            </div>
            <header className="home-header">
              <div className="home-intro"><p className="eyebrow">日子慢慢过，文字慢慢写</p><h1>我的作品<span>。</span></h1><p className="subtitle">把生活，留在字里行间。</p></div>
              <LetterDrawing />
            </header>

            <section className="works-section" aria-labelledby="recent-title">
              <div className="section-heading">
                <h2 id="recent-title">最近写下</h2>
                <span>{state.works.length} 篇作品</span>
              </div>
              <div className="work-list">
                {state.works.map((work) => (
                  <button className="work-card" key={work.id} type="button" onClick={() => dispatch({ type: 'open-work', work })}>
                    <span className={`work-cover ${work.tone}`} aria-hidden="true"><StoryDrawing kind={work.id === 'flower' ? 'flower' : work.id === 'train' ? 'train' : 'bike'} /><b>{work.mark}</b></span>
                    <span className="work-copy">
                      <strong>{work.title}</strong>
                      <span className="work-topline"><time>{work.meta.split(' ')[0]}</time><i>·</i><span>{countWords(work.segments).toLocaleString()} 字</span></span>
                      <span className="work-bottom"><small className={work.status === '已完成' ? 'complete' : ''}>{work.status === '还想再说一点' ? '写作中' : work.status}</small><i>继续写 <Icon name="arrow" /></i></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="create-dock">
            <div className="dock-hint">不必想好开头，从想说的开始。</div>
            <button className="create-button" type="button" onClick={() => dispatch({ type: 'new-work' })}>
              <MicIcon />
              <span><strong>开始写作</strong></span>
              <Icon name="arrow" />
            </button>
          </footer>
          {renderToast()}
        </section>
      </main>
    );
  }

  if (state.screen === 'segment-edit') {
    return (
      <main className="stage">
        <section className="phone-shell app-view edit-segment-screen" aria-label="编辑这一段">
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
              if (!state.editSegmentId) return;
              if (state.editSegmentId === 'pending') {
                patch({ pendingVoice: state.editText.trim(), voiceState: state.editText.trim() ? 'review' : 'idle', screen: 'editor', editSegmentId: null });
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
        <header className="topbar editor-topbar">
          <button className="icon-button" type="button" aria-label="返回作品" onClick={() => patch({ screen: 'home' })}><BackIcon /></button>
          <div><strong>开始写作</strong></div>
          <button className="text-button save-text" type="button" onClick={saveWork}>保存</button>
        </header>

        <div className={`editor-scroll ${state.inputMode === 'text' ? 'text-mode' : ''}`}>
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
              className="full-text-editor"
              value={state.textDraft}
              onChange={(event) => patch({ textDraft: event.target.value })}
              placeholder="从想说的一句话开始……"
              aria-label="文章正文"
              inputMode="text"
              autoCapitalize="sentences"
            />
          ) : (
            <div className="story-content">
              {!state.segments.length && (
                <div className="empty-writing">
                  <p>从想说的一句话开始……</p>
                </div>
              )}
              {state.segments.map((segment, index) => (
                <div key={segment.id}>
                  <button className="story-paragraph" type="button" aria-label={`编辑第${index + 1}段：${segment.text}`} onClick={() => openSegment(segment)}>
                    <p>{segment.text}</p>
                  </button>
                  {index === 0 && state.illustration && <MemoryIllustration kind={state.illustration} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className={`editor-dock ${state.inputMode}`}>
          <div className="composer-toolbar">
            <div className="mode-tabs" role="tablist" aria-label="输入方式">
              <button className={state.inputMode === 'voice' ? 'active' : ''} disabled={state.voiceState === 'recording'} aria-label="语音输入" type="button" role="tab" aria-selected={state.inputMode === 'voice'} onClick={() => changeMode('voice')}><Icon name="mic" />语音</button>
              <button className={state.inputMode === 'text' ? 'active' : ''} disabled={state.voiceState === 'recording'} aria-label="文字输入" type="button" role="tab" aria-selected={state.inputMode === 'text'} onClick={() => changeMode('text')}><Icon name="pen" />文字</button>
            </div>
            <span className="toolbar-divider" />
            <div className="editor-actions" aria-label="写作辅助">
              <button type="button" disabled={state.voiceState === 'recording'} aria-label="聊天引导" onClick={openChat}><Icon name="chat" />聊天</button>
              <button type="button" disabled={state.voiceState === 'recording'} aria-label="文章优化" onClick={openOptimization}><Icon name="spark" />优化</button>
            </div>
          </div>

          {state.inputMode === 'voice' && (
            <div className={`voice-panel ${state.voiceState}`}>
              <div className="transcript-stage">
              {state.voiceState === 'idle' && <div className="voice-tip"><span className="quiet-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><p>不着急，慢慢说。<br /><span>文字会在这里轻轻落下。</span></p></div>}
              {state.voiceState === 'recording' && (
                <div className="live-transcript">
                  <div className="transcript-meta"><Waveform compact /><span>正在聆听 · {state.recordingElapsed} 秒</span></div>
                  <p ref={transcriptRef}>{recordingCopy}<i /></p>
                </div>
              )}
              {state.voiceState === 'review' && (
                <button className="pending-transcript" aria-label="编辑刚刚说的内容" type="button" onClick={() => {
                  const temporary: Segment = { id: 'pending', text: state.pendingVoice };
                  patch({ screen: 'segment-edit', editSegmentId: 'pending', editText: temporary.text });
                }}>
                  <span className="transcript-meta"><span><Icon name="check" /> 已转成文字</span><Icon name="pen" /></span><p>{state.pendingVoice}</p>
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
          {state.inputMode === 'text' && <MockKeyboard onKey={typeWithMockKeyboard} />}
        </footer>

        {state.previousSegments && (
          <div className="undo-bar"><span><Icon name="check" /> 已应用优化</span><button type="button" onClick={undoOptimization}><Icon name="undo" />撤销</button></div>
        )}
        {state.optimizeSheet && <OptimizationSheet state={state} patch={patch} apply={applyOptimization} />}
        {renderToast()}
      </section>
    </main>
  );
}

function MockKeyboard({ onKey }: { onKey: (key: string) => void }) {
  const rows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
  ];
  const labels: Record<string, string> = { shift: '⇧', backspace: '⌫' };
  return (
    <div className="mock-keyboard" aria-label="演示键盘">
      <div className="candidate-row" aria-label="候选词">
        {['我', '我们', '我的', '我是', '回忆'].map((candidate) => (
          <button key={candidate} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onKey(candidate)}>{candidate}</button>
        ))}
        <span aria-hidden="true">⌄</span>
      </div>
      <div className="keyboard-keys">
        {rows.map((row, rowIndex) => (
          <div className={`keyboard-row row-${rowIndex + 1}`} key={row.join('')}>
            {row.map((key) => (
              <button
                className={`keyboard-key ${key === 'shift' || key === 'backspace' ? 'special' : ''}`}
                key={key}
                type="button"
                aria-label={key === 'backspace' ? '删除' : key === 'shift' ? '大写' : key}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (key !== 'shift') onKey(key);
                }}
              >{labels[key] ?? key.toUpperCase()}</button>
            ))}
          </div>
        ))}
        <div className="keyboard-row bottom-row">
          <button className="keyboard-key function-key" type="button" onPointerDown={(event) => event.preventDefault()}>123</button>
          <button className="keyboard-key function-key" type="button" onPointerDown={(event) => event.preventDefault()}>中/英</button>
          <button className="keyboard-key space-key" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onKey('space')}>空格</button>
          <button className="keyboard-key enter-key" type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => onKey('enter')}>换行</button>
        </div>
      </div>
    </div>
  );
}

function MemoryIllustration({ kind }: { kind: string }) {
  const labels: Record<string, [string, string]> = {
    train: ['北去的列车', '一九六八'],
    home: ['记忆里的老屋', '桂花又香'],
    dinner: ['一桌团圆饭', '家的味道'],
  };
  const [title, note] = labels[kind] ?? labels.train;
  return (
    <figure className={`memory-art ${kind}`} aria-label={`文章配图：${title}`}>
      <StoryDrawing kind={kind} />
      <figcaption><strong>{title}</strong><small>{note}</small></figcaption>
    </figure>
  );
}

function OptimizationSheet({
  state,
  patch,
  apply,
}: {
  state: AppState;
  patch: (next: Partial<AppState>) => void;
  apply: () => void;
}) {
  const sheetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    sheet?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); patch({ optimizeSheet: null }); }
      if (event.key !== 'Tab' || !sheet) return;
      const controls = Array.from(sheet.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,[tabindex="0"]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, [state.optimizeSheet, patch]);
  const close = () => patch({ optimizeSheet: null });
  const choose = (choice: string) => patch({ optimizeChoice: choice, optimizeSheet: 'result' });
  const sheetTitles: Record<string, string> = {
    menu: '想怎样整理这篇文章？', content: '选择文章类型', style: '选择喜欢的文风',
    format: '整理格式与标点', image: '选择一张文章配图', custom: '告诉小文您的要求', result: '看看优化后的样子',
  };
  return (
    <div className="sheet-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className="bottom-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" />
        <header className="sheet-header"><div><small><Icon name="spark" /> 小文的写作工具</small><h2 id="sheet-title">{sheetTitles[state.optimizeSheet ?? 'menu']}</h2></div><button type="button" aria-label="关闭" onClick={close}><Icon name="close" /></button></header>

        {state.optimizeSheet === 'menu' && (
          <div className="optimize-menu">
            <button type="button" onClick={() => patch({ optimizeSheet: 'content' })}><span><Icon name="book" /></span><b>内容类型</b><small>为文字，选一种模样</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'style' })}><span><Icon name="pen" /></span><b>文风调整</b><small>让表达更贴近心意</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'format' })}><span><Icon name="format" /></span><b>格式整理</b><small>分段、标点，清晰一点</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'image' })}><span><Icon name="image" /></span><b>AI 配图</b><small>给故事添一幅画</small></button>
            <button className="wide" type="button" onClick={() => patch({ optimizeSheet: 'custom' })}><span><Icon name="chat" /></span><b>其他要求</b><small>把您的想法告诉小文</small><Icon name="arrow" /></button>
          </div>
        )}

        {state.optimizeSheet === 'content' && <OptionList options={CONTENT_TYPES} selected={state.optimizeChoice} onChoose={choose} />}
        {state.optimizeSheet === 'style' && <OptionList options={WRITING_STYLES} selected={state.optimizeChoice} onChoose={choose} />}
        {state.optimizeSheet === 'format' && <OptionList options={FORMAT_OPTIONS} selected={state.optimizeChoice} onChoose={choose} />}

        {state.optimizeSheet === 'image' && (
          <div className="image-options">
            {(['train', 'home', 'dinner'] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => choose(`配图：${kind}`)}><MemoryIllustration kind={kind} /></button>
            ))}
          </div>
        )}

        {state.optimizeSheet === 'custom' && (
          <div className="custom-requirement">
            <div className="prompt-chips">{CUSTOM_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => patch({ customPrompt: prompt })}>{prompt}</button>)}</div>
            <textarea value={state.customPrompt} onChange={(event) => patch({ customPrompt: event.target.value })} placeholder="例如：把母亲送我上车的细节写得更感人……" aria-label="自定义优化要求" />
            <button className="primary-button" type="button" disabled={!state.customPrompt.trim()} onClick={() => choose(state.customPrompt.trim())}>让小文试着改改</button>
          </div>
        )}

        {state.optimizeSheet === 'result' && (
          <div className="optimization-result">
            <span className="choice-chip"><Icon name="spark" />{state.optimizeChoice.startsWith('配图：') ? '为文章添一幅画' : state.optimizeChoice}</span>
            {state.optimizeChoice.startsWith('配图：') ? (
              <MemoryIllustration kind={state.optimizeChoice.replace('配图：', '')} />
            ) : (
              <div className="result-preview">
                <p>我十六岁那年，第一次离开上海，坐上一列开往黑龙江的绿皮火车。</p>
                <p>汽笛响起时，我还没有真正明白，这一走，故乡就到了千里之外……</p>
              </div>
            )}
            <ul><li><Icon name="check" />保留您的故事与口吻</li><li><Icon name="check" />{state.optimizeChoice.startsWith('配图：') ? '配图将放在第一段之后' : '语句更流畅，段落更清晰'}</li></ul>
            <div className="result-actions"><button type="button" onClick={close}>先不修改</button><button className="primary-button" type="button" onClick={apply}>应用优化</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function OptionList({ options, selected, onChoose }: { options: string[]; selected: string; onChoose: (option: string) => void }) {
  const descriptions: Record<string, string> = {
    '回忆录': '把走过的岁月，一页页留下', '生活随笔': '记下日常里的小小感受', '亲情故事': '写写那些最亲近的人', '口述故事': '就像您亲口说的那样',
    '朴实真诚': '不加修饰，真心自然流露', '温暖叙事': '让细节里多一点温度', '文学散文': '让文字多一些意境', '轻松幽默': '轻轻松松，读来会心一笑',
    '自动分段': '为每个意思，留一点呼吸', '修正标点': '让停顿和语气更清楚', '添加小标题': '给每一节，取个小名字',
  };
  return (
    <div className="option-list">
      {options.map((option) => (
        <button className={selected === option ? 'selected' : ''} key={option} type="button" onClick={() => onChoose(option)}>
          <span className="option-copy"><b>{option}</b><small>{descriptions[option]}</small></span><Icon name={selected === option ? 'check' : 'chevron'} />
        </button>
      ))}
    </div>
  );
}
