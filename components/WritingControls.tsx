import { Icon } from './Icons';

export function WritingToolbar({ mode, onMode, onChat, onOptimize, disabled = false }: {
  mode: 'voice' | 'text'; onMode: (mode: 'voice' | 'text') => void;
  onChat: () => void; onOptimize: () => void; disabled?: boolean;
}) {
  return <div className="composer-toolbar" aria-label="创作方式与工具">
    <div className="mode-tabs" role="tablist" aria-label="输入方式">
      <button className={mode === 'voice' ? 'active' : ''} type="button" role="tab" aria-label="语音输入" aria-selected={mode === 'voice'} disabled={disabled} onClick={() => onMode('voice')}><Icon name="mic" />语音</button>
      <button className={mode === 'text' ? 'active' : ''} type="button" role="tab" aria-label="文字输入" aria-selected={mode === 'text'} disabled={disabled} onClick={() => onMode('text')}><Icon name="pen" />文字</button>
    </div>
    <span className="toolbar-divider" aria-hidden="true" />
    <div className="editor-actions" aria-label="写作辅助">
      <button type="button" aria-label="聊天引导" disabled={disabled} onClick={onChat}><Icon name="chat" />聊天</button>
      <button type="button" aria-label="文章优化" disabled={disabled} onClick={onOptimize}><Icon name="spark" />优化</button>
    </div>
  </div>;
}

export function VoiceIdle() {
  return <div className="voice-tip"><span className="quiet-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><p>不着急，慢慢说。<br /><span>文字会在这里轻轻落下。</span></p></div>;
}
