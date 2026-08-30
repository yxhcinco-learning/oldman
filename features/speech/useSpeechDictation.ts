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

export function useSpeechDictation(value: string, onChange: (text: string) => void) {
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
    const hold = new HoldGesture(() => {
      if (!current.current.consent) { setAskConsent(true); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) { setTip('当前浏览器不支持录音，请使用文字输入'); return; }
      if (!['idle', 'error'].includes(session.state.phase)) return;
      prefix.current = current.current.value;
      lastText.current = '';
      setTip('');
      void session.start();
    }, () => { void session.stop(); }, () => {
      const active = !['idle', 'error'].includes(session.state.phase);
      session.cancel();
      if (active && !disposed) current.current.onChange(prefix.current);
    }, () => setTip('请按住麦克风，再开始说话'));
    holdRef.current = hold;
    const resetHolding = () => { holdSource.current = null; setHolding(false); };
    const hidden = () => { if (document.hidden) { resetHolding(); hold.release(); } };
    const leave = () => { resetHolding(); hold.cancel(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { resetHolding(); hold.cancel(); } };
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('keydown', escape);
    window.addEventListener('pagehide', leave);
    return () => {
      disposed = true;
      hold.cancel();
      holdRef.current = null;
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('pagehide', leave);
    };
  }, []);

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
      setTip('已同意，请按住麦克风说话');
    },
    clearTip: () => setTip(''),
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
