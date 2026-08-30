import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { HoldGesture } from './hold';
import { SpeechSession, type SpeechState } from './session';

const VOICE_CONSENT_KEY = 'suiyue-voice-consent-v1';

function hasVoiceConsent() {
  try { return localStorage.getItem(VOICE_CONSENT_KEY) === 'yes'; }
  catch { return false; }
}

function rememberVoiceConsent() {
  try { localStorage.setItem(VOICE_CONSENT_KEY, 'yes'); }
  catch { /* Keep consent for this mounted session. */ }
}

export function useSpeechDictation(value: string, onChange: (text: string) => void, interaction: 'hold' | 'tap' = 'hold') {
  const [speech, setSpeech] = useState<SpeechState>({ phase: 'idle', text: '', elapsed: 0, level: 0, message: '' });
  const [holding, setHolding] = useState(false);
  const [consent, setConsent] = useState(hasVoiceConsent);
  const [askConsent, setAskConsent] = useState(false);
  const [tip, setTip] = useState('');
  const current = useRef({ value, onChange, consent });
  useLayoutEffect(() => { current.current = { value, onChange, consent }; }, [value, onChange, consent]);
  const prefix = useRef('');
  const lastText = useRef('');
  const holdRef = useRef<HoldGesture | null>(null);
  const holdSource = useRef<'pointer' | 'keyboard' | null>(null);
  const tapToggleRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    const session = new SpeechSession(next => {
      if (disposed) return;
      setSpeech(next);
      if (next.text && next.text !== lastText.current) {
        lastText.current = next.text;
        current.current.onChange(prefix.current + next.text);
      }
    });
    const start = () => {
      if (!current.current.consent) { setAskConsent(true); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) { setTip('当前浏览器不支持录音，请使用文字输入'); return; }
      if (!['idle', 'error'].includes(session.state.phase)) return;
      prefix.current = current.current.value;
      lastText.current = '';
      setTip('');
      void session.start();
    };
    const cancel = (restorePrefix: boolean) => {
      const active = !['idle', 'error'].includes(session.state.phase);
      session.cancel();
      if (active && restorePrefix && !disposed) current.current.onChange(prefix.current);
    };
    const hold = new HoldGesture(start, () => { void session.stop(); }, () => cancel(true), () => setTip('请按住麦克风，再开始说话'));
    holdRef.current = hold;
    tapToggleRef.current = () => {
      if (['idle', 'error'].includes(session.state.phase)) start();
      else cancel(false);
    };
    const resetHolding = () => { holdSource.current = null; setHolding(false); };
    const hidden = () => { if (document.hidden) { resetHolding(); if (interaction === 'tap') cancel(true); else hold.release(); } };
    const leave = () => { resetHolding(); hold.cancel(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { resetHolding(); hold.cancel(); } };
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('keydown', escape);
    window.addEventListener('pagehide', leave);
    return () => {
      disposed = true;
      hold.cancel();
      holdRef.current = null;
      tapToggleRef.current = () => {};
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('pagehide', leave);
    };
  }, [interaction]);

  const active = !['idle', 'error'].includes(speech.phase);
  return {
    speech,
    tip,
    active,
    holding,
    recording: speech.phase === 'recording',
    askConsent,
    dismissConsent: () => setAskConsent(false),
    acceptConsent: () => {
      setConsent(true);
      rememberVoiceConsent();
      setAskConsent(false);
      setTip(interaction === 'tap' ? '已同意，请点按麦克风开始说话' : '已同意，请按住麦克风说话');
    },
    clearTip: () => setTip(''),
    tapProps: {
      onClick: () => tapToggleRef.current(),
    },
    holdProps: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || holdSource.current) return;
        holdSource.current = 'pointer';
        setHolding(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        holdRef.current?.press();
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        if (holdSource.current !== 'pointer') return;
        holdSource.current = null;
        setHolding(false);
        holdRef.current?.release();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: () => {
        if (holdSource.current !== 'pointer') return;
        holdSource.current = null;
        setHolding(false);
        holdRef.current?.cancel();
      },
      onBlur: () => {
        if (holdSource.current !== 'keyboard') return;
        holdSource.current = null;
        setHolding(false);
        holdRef.current?.release();
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !holdSource.current) {
          event.preventDefault();
          holdSource.current = 'keyboard';
          setHolding(true);
          holdRef.current?.press();
        }
      },
      onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === ' ' || event.key === 'Enter') && holdSource.current === 'keyboard') {
          event.preventDefault();
          holdSource.current = null;
          setHolding(false);
          holdRef.current?.release();
        }
      },
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}
