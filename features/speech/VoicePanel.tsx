import { useEffect, useRef } from 'react';
import { Icon, MicIcon } from '../../components/Icons';
import { Dialog } from '../../components/Dialog';
import { VoiceIdle } from '../../components/WritingControls';
import { textOffsetFromPoint } from '../../lib/pointCaret';
import { useSpeechDictation } from './useSpeechDictation';

export function VoicePanel({ pending, onPending, onEdit, onDone, onCollapse }: {
  pending: string; onPending: (text: string) => void; onEdit: (caretOffset: number) => void; onDone: () => void; onCollapse?: () => void;
}) {
  const dictation = useSpeechDictation(pending, onPending);
  const text = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (text.current) text.current.scrollTop = text.current.scrollHeight; }, [pending]);
  const { speech, tip, active, recording } = dictation;
  return <div className={`voice-panel ${active ? 'recording' : pending ? 'review' : 'idle'}`} data-phase={speech.phase}>
    <div className="transcript-stage">{active ? <div className="live-transcript"><div className="transcript-meta"><span className="actual-wave" aria-label="实时音量">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: `${3 + speech.level * (7 + (i % 4) * 4)}px` }} />)}</span><span>{speech.phase === 'finishing' ? '确认中…' : recording ? `正在聆听 · ${speech.elapsed} 秒` : speech.phase === 'permission' ? '等待麦克风授权…' : '正在连接…'}</span></div><p ref={text}>{recording || speech.phase === 'finishing' ? pending || speech.message || '正在听…' : speech.message}<i /></p></div> : pending ? <button type="button" className="pending-transcript" aria-label="修改待确认转写" onClick={event => { const pendingText = event.currentTarget.querySelector<HTMLElement>('.pending-transcript-text'); onEdit(pendingText ? textOffsetFromPoint(pendingText, event.clientX, event.clientY) : pending.length); }}><div className="transcript-meta"><span><Icon name="check" />已转成文字</span><Icon name="pen" /></div><p>{(speech.message || tip) && <span className="transcript-warning" role="status">{speech.message || tip}<br /></span>}<span className="pending-transcript-text">{pending}</span></p></button> : speech.message || tip ? <div className="voice-message" role="status"><Icon name="mic" /><p>{speech.message || tip}</p></div> : <VoiceIdle />}</div>
    <div className="voice-controls"><div className="voice-side-group">{!active && !pending && onCollapse && <button type="button" className="voice-side voice-collapse" aria-label="收起语音输入" onClick={onCollapse}><Icon name="chevron" /></button>}
      {!active && pending && <button type="button" className="voice-side cancel" onClick={() => { onPending(''); dictation.clearTip(); }}>取消</button>}</div>
      <button className={`mic-button ${recording ? 'pressed' : ''}`} type="button" aria-label="按住说话" {...dictation.holdProps}><MicIcon /></button>
      {!active && pending ? <button type="button" className="voice-side done" onClick={onDone}>完成</button> : <span />}</div>
    <small className="continue-hint">{recording ? '松开，结束这一段' : active ? '请稍候…' : pending ? '还想补充？可以继续按住说' : '按住说话'}</small>
    {dictation.askConsent && <Dialog title="开启语音输入" onClose={dictation.dismissConsent}><p>说话时，音频会发送给腾讯云转成文字。本产品不保存原始录音。</p><p>是否同意使用麦克风进行识别？</p><button className="primary-button consent-button" type="button" onClick={dictation.acceptConsent}>同意，继续</button><button className="text-button" type="button" onClick={dictation.dismissConsent}>暂不开启</button></Dialog>}
  </div>;
}
