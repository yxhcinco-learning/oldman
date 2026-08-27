'use client';

import {
  useEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import {
  CONTENT_TYPES,
  CUSTOM_PROMPTS,
  FORMAT_OPTIONS,
  INITIAL_WORKS,
  VOICE_PHRASES,
  WRITING_STYLES,
  articleText,
  buildChatIntro,
  countWords,
  getChatReply,
  getChatUserPhrase,
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
      const segments = state.segments.map((segment) => segment.id === action.id ? { ...segment, text: action.text } : segment);
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
  return <span className="back-icon" aria-hidden="true">‹</span>;
}

function MicIcon() {
  return <span className="mic-glyph" aria-hidden="true"><i /></span>;
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

export default function Home() {
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

  useEffect(() => {
    if (!state.optimizeSheet) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'patch', patch: { optimizeSheet: null } });
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [state.optimizeSheet]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (transcriptTimer.current) clearInterval(transcriptTimer.current);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function patch(next: Partial<AppState>) {
    dispatch({ type: 'patch', patch: next });
  }

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

  function openOptimization() {
    const segments = state.inputMode === 'text' ? splitDraft(state.textDraft) : state.segments;
    if (!segments.length) {
      showToast('先写下一句，再请小文帮您优化');
      return;
    }
    if (state.inputMode === 'text') dispatch({ type: 'replace-segments', segments });
    patch({ optimizeSheet: 'menu', toast: null });
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

  function saveWork() {
    const segments = state.inputMode === 'text' ? splitDraft(state.textDraft) : state.segments;
    if (!segments.length) {
      showToast('还没有内容，先写下一句吧');
      return;
    }
    const firstLine = segments[0].text.replace(/\s/g, '');
    const inferredTitle = `${firstLine.slice(0, 10)}${firstLine.length > 10 ? '…' : ''}`;
    const title = state.title.trim() || inferredTitle || '未命名作品';
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
    patch({ works, screen: 'home', currentWorkId: newWork.id, title, segments, toast: '文章已经安心保存好了' });
  }

  function applyOptimization() {
    if (state.optimizeChoice.startsWith('配图：')) {
      patch({ illustration: state.optimizeChoice.replace('配图：', ''), optimizeSheet: null, toast: '配图已经放进文章里了' });
      return;
    }
    const source = state.segments;
    const next = optimizedSegments(source, state.optimizeChoice);
    dispatch({ type: 'replace-segments', segments: next, previous: source });
    patch({ optimizeSheet: null, toast: null });
  }

  function undoOptimization() {
    if (!state.previousSegments) return;
    dispatch({ type: 'replace-segments', segments: state.previousSegments, previous: null });
    patch({ toast: '已经恢复到优化前的内容' });
  }

  function openSegment(segment: Segment) {
    patch({ screen: 'segment-edit', editSegmentId: segment.id, editText: segment.text });
  }

  const recordingCopy = [state.pendingVoice, state.liveVoice].filter(Boolean).join('');

  function renderToast() {
    const placement = state.screen === 'home'
      ? 'home'
      : state.screen === 'chat'
        ? 'chat'
        : state.screen === 'segment-edit'
          ? 'segment'
          : `editor ${state.inputMode}`;
    return state.toast ? <div className={`toast ${placement}`} role="status">{state.toast}</div> : null;
  }

  if (state.screen === 'home') {
    return (
      <main className="stage">
        <section className="phone-shell home-screen" aria-label="岁月有声写作应用">
          <div className="home-scroll">
            <header className="home-header">
              <div>
                <p className="eyebrow">岁月有声</p>
                <h1>我的作品</h1>
                <p className="subtitle">想说的，慢慢写下来</p>
              </div>
              <button className="round-button" type="button" aria-label="更多选项" onClick={() => showToast('这里会放常用设置')}>•••</button>
            </header>

            <div className="memory-strip" aria-hidden="true"><span>春</span><i /><span>夏</span><i /><span>秋</span><i /><span>冬</span></div>

            <section className="works-section" aria-labelledby="recent-title">
              <div className="section-heading">
                <h2 id="recent-title">最近写下</h2>
                <span>共 {state.works.length} 篇</span>
              </div>
              <div className="work-list">
                {state.works.map((work) => (
                  <button className="work-card" key={work.id} type="button" onClick={() => dispatch({ type: 'open-work', work })}>
                    <span className={`work-cover ${work.tone}`} aria-hidden="true"><b>{work.mark}</b><small>岁月手记</small></span>
                    <span className="work-copy">
                      <span className="work-topline"><small>{work.status}</small><time>{work.meta}</time></span>
                      <strong>{work.title}</strong>
                      <span className="work-bottom"><span>{countWords(work.segments).toLocaleString()} 字</span><i>继续写</i></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="create-dock">
            <div className="dock-hint"><span aria-hidden="true">✦</span> 不知道写什么？先说一句就好</div>
            <button className="create-button" type="button" onClick={() => dispatch({ type: 'new-work' })}>
              <MicIcon />
              <span><strong>开始写作</strong><small>按住说话，也可以打字</small></span>
              <b aria-hidden="true">›</b>
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
            <div><strong>编辑这一段</strong><small>可以修改错字和标点</small></div>
            <span className="topbar-spacer" />
          </header>
          <div className="segment-editor-wrap">
            <span className="quote-mark" aria-hidden="true">“</span>
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
          <header className="topbar chat-topbar">
            <button className="icon-button" type="button" aria-label="返回文章" onClick={() => patch({ screen: 'editor', voiceState: 'idle' })}><BackIcon /></button>
            <div><strong>和小文聊一聊</strong><small><i /> 正在陪您创作</small></div>
            <button className="text-button" type="button" onClick={finishChat}>完成</button>
          </header>

          <div className="chat-scroll" ref={chatScrollRef}>
            <div className="chat-day">今天</div>
            {state.messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="assistant-avatar" aria-hidden="true">文</span>}
                <div className="message-bubble">{message.text}</div>
              </div>
            ))}
            {state.aiTyping && (
              <div className="message-row assistant">
                <span className="assistant-avatar" aria-hidden="true">文</span>
                <div className="message-bubble typing"><i /><i /><i /></div>
              </div>
            )}
          </div>

          <footer className="chat-dock">
            <p>像发微信语音一样，按住下面的按钮说话</p>
            <button
              className="hold-to-talk"
              type="button"
              onPointerDown={(event) => handleHoldStart('chat', event)}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldCancel}
              onKeyDown={(event) => handleHoldKeyDown('chat', event)}
              onKeyUp={handleHoldKeyUp}
              onContextMenu={(event) => event.preventDefault()}
            >按住说话</button>
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
              placeholder="在这里输入想写的话……"
              aria-label="文章正文"
              inputMode="text"
              autoCapitalize="sentences"
            />
          ) : (
            <div className="story-content">
              {!state.segments.length && (
                <div className="empty-writing">
                  <p>从想说的一句话开始</p>
                </div>
              )}
              {state.segments.map((segment, index) => (
                <div key={segment.id}>
                  <button className="story-paragraph" type="button" onClick={() => openSegment(segment)}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <p>{segment.text}</p>
                  </button>
                  {index === 0 && state.illustration && <MemoryIllustration kind={state.illustration} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {state.previousSegments && (
          <div className="undo-bar"><span>已按“{state.optimizeChoice || '您的要求'}”优化</span><button type="button" onClick={undoOptimization}>撤销</button></div>
        )}

        <footer className={`editor-dock ${state.inputMode}`}>
          <div className="creation-controls" aria-label="创作方式与工具">
            <div className="mode-tabs" role="tablist" aria-label="输入方式">
              <button className={state.inputMode === 'voice' ? 'active' : ''} type="button" role="tab" aria-selected={state.inputMode === 'voice'} onClick={() => changeMode('voice')}>语音输入</button>
              <button className={state.inputMode === 'text' ? 'active' : ''} type="button" role="tab" aria-selected={state.inputMode === 'text'} onClick={() => changeMode('text')}>文字输入</button>
            </div>
            <div className="editor-actions" aria-label="写作辅助">
              <button type="button" onClick={openChat}>聊天引导</button>
              <button type="button" onClick={openOptimization}>文章优化</button>
            </div>
          </div>

          {state.inputMode === 'voice' && (
            <div className={`voice-panel ${state.voiceState}`}>
              <div className="voice-stage">
                {state.voiceState === 'idle' && <p className="voice-tip">按住麦克风，把想说的话慢慢讲出来</p>}
                {state.voiceState === 'recording' && (
                  <div className="live-transcript">
                    <div><Waveform compact /><span>{state.recordingElapsed} 秒</span></div>
                    <p ref={liveTranscriptRef}>{recordingCopy}<i /></p>
                  </div>
                )}
                {state.voiceState === 'review' && (
                  <button className="pending-transcript" type="button" aria-label="点击修改刚刚识别的文字" onClick={() => {
                    const temporary: Segment = { id: 'pending', text: state.pendingVoice };
                    patch({ screen: 'segment-edit', editSegmentId: 'pending', editText: temporary.text });
                  }}>
                    <p>{state.pendingVoice}</p>
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
            </div>
          )}
          {state.inputMode === 'text' && <MockKeyboard onKey={typeWithMockKeyboard} />}
        </footer>

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
      <div className="sun" /><div className="horizon" /><div className="art-shape" />
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
  const close = () => patch({ optimizeSheet: null });
  const choose = (choice: string) => patch({ optimizeChoice: choice, optimizeSheet: 'result' });
  const sheetTitles: Record<string, string> = {
    menu: '想怎样整理这篇文章？', content: '选择文章类型', style: '选择喜欢的文风',
    format: '整理格式与标点', image: '选择一张文章配图', custom: '告诉小文您的要求', result: '看看优化后的样子',
  };
  const optimizedPreview = optimizedSegments(state.segments, state.optimizeChoice).slice(0, 2);
  return (
    <div className="sheet-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div><small>文章优化</small><h2 id="sheet-title">{sheetTitles[state.optimizeSheet ?? 'menu']}</h2></div>
          <div className="sheet-header-actions">
            {state.optimizeSheet !== 'menu' && <button type="button" aria-label="返回优化选项" onClick={() => patch({ optimizeSheet: 'menu' })}>‹</button>}
            <button type="button" aria-label="关闭" onClick={close}>×</button>
          </div>
        </header>

        {state.optimizeSheet === 'menu' && (
          <div className="optimize-menu">
            <button type="button" onClick={() => patch({ optimizeSheet: 'content' })}><span>文</span><b>内容类型</b><small>散文、诗歌等</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'style' })}><span>风</span><b>文风调整</b><small>保持您的口吻</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'format' })}><span>序</span><b>格式整理</b><small>分段与标点</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'image' })}><span>景</span><b>AI 配图</b><small>选择故事画面</small></button>
            <button className="wide" type="button" onClick={() => patch({ optimizeSheet: 'custom' })}><span>✦</span><b>其他要求</b><small>直接告诉小文怎么改</small></button>
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
            <span className="choice-chip">按“{state.optimizeChoice.replace('配图：', '')}”优化</span>
            {state.optimizeChoice.startsWith('配图：') ? (
              <MemoryIllustration kind={state.optimizeChoice.replace('配图：', '')} />
            ) : (
              <div className="result-preview">
                {optimizedPreview.map((segment) => <p key={segment.id}>{segment.text}</p>)}
              </div>
            )}
            <ul>
              <li>保留了原来的内容和口吻</li>
              <li>{state.optimizeChoice.startsWith('配图：') ? '配图会放在第一段后面' : state.optimizeChoice === '诗歌' ? '重排了诗句、节奏和留白' : '调整了分段、标点和语句节奏'}</li>
            </ul>
            <div className="result-actions"><button type="button" onClick={close}>先不修改</button><button className="primary-button" type="button" onClick={apply}>应用优化</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function OptionList({ options, selected, onChoose }: { options: string[]; selected: string; onChoose: (option: string) => void }) {
  return (
    <div className="option-list">
      {options.map((option, index) => (
        <button className={selected === option ? 'selected' : ''} key={option} type="button" aria-pressed={selected === option} onClick={() => onChoose(option)}>
          <span>{['一', '二', '三', '四'][index]}</span><b>{option}</b><i aria-hidden="true">›</i>
        </button>
      ))}
    </div>
  );
}
