import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MicIcon } from '../../components/Icons';
import { Dialog } from '../../components/Dialog';
import { SpeechSession, type SpeechState } from './session';
import { HoldGesture } from './hold';

export function VoicePanel({ pending, onPending, onEdit, onDone }: { pending: string; onPending: (text: string) => void; onEdit: () => void; onDone: () => void }) {
  const [speech, setSpeech] = useState<SpeechState>({ phase: 'idle', text: '', elapsed: 0, level: 0, message: '' });
  const [consent, setConsent] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [tip, setTip] = useState('');
  const propsRef = useRef({ pending, onPending, consent });
  useLayoutEffect(() => { propsRef.current = { pending, onPending, consent }; }, [pending, onPending, consent]);
  const prefix = useRef('');
  const lastText = useRef('');
  const text = useRef<HTMLParagraphElement>(null);
  const holdRef = useRef<HoldGesture | null>(null);
  useEffect(() => {
    let disposed = false;
    const session = new SpeechSession(next => {
    if (disposed) return;
    setSpeech(next);
    if (next.text && next.text !== lastText.current) { lastText.current = next.text; propsRef.current.onPending(prefix.current + next.text); }
    });
    const hold = new HoldGesture(() => {
    if (!propsRef.current.consent) { setAskConsent(true); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) { setTip('当前浏览器不支持录音，请切换文字输入'); return; }
    if (!['idle', 'error'].includes(session.state.phase)) return;
    prefix.current = propsRef.current.pending; lastText.current = ''; setTip(''); void session.start();
  }, () => { void session.stop(); }, () => {
    const active = !['idle', 'error'].includes(session.state.phase);
    session.cancel(); if (active && !disposed) propsRef.current.onPending(prefix.current);
    }, () => setTip('请按住麦克风，再开始说话'));
    holdRef.current = hold;
    const hidden = () => { if (document.hidden) void session.stop(); };
    const leave = () => { session.cancel(); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') hold.cancel(); };
    document.addEventListener('visibilitychange', hidden); document.addEventListener('keydown', escape); window.addEventListener('pagehide', leave);
    return () => { disposed = true; hold.cancel(); holdRef.current = null; document.removeEventListener('visibilitychange', hidden); document.removeEventListener('keydown', escape); window.removeEventListener('pagehide', leave); };
  }, []);
  useEffect(() => { if (text.current) text.current.scrollTop = text.current.scrollHeight; }, [pending]);
  const active = !['idle', 'error'].includes(speech.phase);
  const recording = speech.phase === 'recording';
  return <div className={`voice-panel ${active ? 'recording' : pending ? 'review' : 'idle'}`}>
    <div className="voice-stage">{active ? <div className="live-transcript"><div><span className="actual-wave" aria-label="实时音量">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: `${3 + speech.level * (7 + (i % 4) * 4)}px` }} />)}</span><span>{speech.phase === 'finishing' ? '确认中…' : `${speech.elapsed} 秒`}</span></div><p ref={text}>{recording || speech.phase === 'finishing' ? pending || speech.message || '正在听…' : speech.message}<i /></p></div> : pending ? <button type="button" className="pending-transcript" aria-label="修改待确认转写" onClick={onEdit}><p>{pending}</p></button> : <p className="voice-tip">{speech.message || tip || '按住麦克风，把想说的话慢慢讲出来'}</p>}</div>
    {pending && !active && (speech.message || tip) && <span className="voice-status" role="status">{speech.message || tip}</span>}
    <div className="voice-controls">{!active && pending ? <button type="button" className="voice-side danger" onClick={() => { onPending(''); setTip(''); }}>清空</button> : <span />}
      <button className={`mic-button ${recording ? 'pressed' : ''}`} type="button" aria-label="按住说话" onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); holdRef.current?.press(); }} onPointerUp={e => { holdRef.current?.release(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => holdRef.current?.cancel()} onLostPointerCapture={() => holdRef.current?.release()} onBlur={() => holdRef.current?.release()} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdRef.current?.press(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); holdRef.current?.release(); } }} onContextMenu={e => e.preventDefault()}><MicIcon /></button>
      {!active && pending ? <button type="button" className="voice-side done" onClick={onDone}>完成</button> : <span />}</div>
    {askConsent && <Dialog title="开启语音输入" onClose={() => setAskConsent(false)}><p>说话时，音频会发送给腾讯云转成文字。本产品不保存原始录音。</p><p>是否同意使用麦克风进行识别？</p><button className="primary-button consent-button" type="button" onClick={() => { setConsent(true); setAskConsent(false); setTip('已同意，按住麦克风开始说话'); }}>同意，继续</button><button className="text-button" type="button" onClick={() => setAskConsent(false)}>暂不开启</button></Dialog>}
  </div>;
}
