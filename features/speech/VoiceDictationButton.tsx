import { useEffect } from 'react';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icons';
import { useSpeechDictation } from './useSpeechDictation';

export function VoiceDictationButton({ value, onChange, disabled = false, onActiveChange }: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const dictation = useSpeechDictation(value, onChange);
  useEffect(() => {
    onActiveChange?.(dictation.active);
    return () => onActiveChange?.(false);
  }, [dictation.active, onActiveChange]);
  const buttonText = dictation.recording ? '松开结束' : dictation.speech.phase === 'finishing' ? '正在确认' : dictation.holding ? '请继续按住' : dictation.active ? '请稍候' : '按住说话';
  const status = dictation.speech.message || dictation.tip;

  return <>
    <div className="ai-voice-controls" data-phase={dictation.speech.phase}>
      {status && <span className="ai-voice-status" role="status">{status}</span>}
      <button type="button" className={dictation.holding ? 'holding' : ''} aria-label="按住说话输入要求" disabled={disabled} {...dictation.holdProps}>
        <Icon name="mic" /><span>{buttonText}</span>
      </button>
    </div>
    {dictation.askConsent && <Dialog className="voice-consent-dialog" title="开启语音输入" onClose={dictation.dismissConsent}>
      <p>说话时，音频会发送给腾讯云转成文字。本产品不保存原始录音。</p>
      <p>是否同意使用麦克风进行识别？</p>
      <button className="primary-button consent-button" type="button" onClick={dictation.acceptConsent}>同意，继续</button>
      <button className="text-button" type="button" onClick={dictation.dismissConsent}>暂不开启</button>
    </Dialog>}
  </>;
}
