import { Icon } from './Icons';

export type AssistantStatus = 'idle' | 'processing' | 'unread' | 'error';

export function WritingToolbar({ mode, onMode, onAssistant, assistantStatus = 'idle', disabled = false, showAssistantTip = false }: {
  mode: 'voice' | 'text'; onMode: (mode: 'voice' | 'text') => void;
  onAssistant: () => void; assistantStatus?: AssistantStatus; disabled?: boolean;
  showAssistantTip?: boolean;
}) {
  const target = mode === 'text' ? 'voice' : 'text';
  const statusLabel = assistantStatus === 'processing' ? '正在处理' : assistantStatus === 'unread' ? '有新回复' : assistantStatus === 'error' ? '需要处理' : '';
  const assistantLabel = statusLabel ? `打开小文，${statusLabel}` : '打开小文';
  return <div className="composer-toolbar" aria-label="创作方式与工具">
    {showAssistantTip && <aside className="optimize-tip" aria-label="小文提示" role="status"><Icon name="leaf" /><p>小文可以陪您接着写，也能帮您整理。</p></aside>}
    <button className="input-mode-switch" type="button" aria-label={`切换到${target === 'voice' ? '语音' : '文字'}输入`} disabled={disabled} onClick={() => onMode(target)}>
      <Icon name={target === 'voice' ? 'mic' : 'keyboard'} className={target === 'text' ? 'keyboard-icon' : ''} />
    </button>
    <span className="toolbar-divider" aria-hidden="true" />
    <button className={`xiaowen-entry status-${assistantStatus}`} type="button" aria-label={assistantLabel} disabled={disabled} onClick={onAssistant}>
      <Icon name="leaf" /><span>小文{statusLabel && <small>{statusLabel}</small>}</span>
    </button>
  </div>;
}

export function VoiceIdle() {
  return <div className="voice-tip"><span className="quiet-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><p>不着急，慢慢说。</p></div>;
}
