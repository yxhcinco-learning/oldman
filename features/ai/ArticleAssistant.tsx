import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icons';
import { ACTION_LABELS, VERSION_LABELS, documentOf, sameDocument, resultSummary, type AiAction, type AiTurn, type ArticleVersion } from '../../lib/domain/article-ai';
import { Workspace } from '../writing/workspace';
import { ArticleAiController } from './session';

type Page = 'menu' | 'chat' | 'preview' | 'history' | 'version' | 'consent';
const CONSENT_KEY = 'suiyue-article-ai-consent-v1';
const TURN_LABELS: Record<AiTurn['status'], string> = {
  running: '正在处理', ready: '待应用', applied: '已应用', dismissed: '未采用', answered: '已回答', failed: '未完成', cancelled: '已取消',
};
function hasConsent() { try { return localStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; } }
function timeLabel(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function turnPromptLabel(turn: AiTurn) {
  if (turn.prompt.trim()) return turn.prompt;
  if (turn.action === 'regular') return '常规优化全文';
  if (turn.action === 'polish') return '润色全文';
  return ACTION_LABELS[turn.action];
}
function turnStateLabel(turn: AiTurn, baseBody?: string) {
  return turn.result?.body !== undefined && baseBody !== undefined && turn.result.body === baseBody ? '无正文变化' : TURN_LABELS[turn.status];
}
function isConversationEdit(action: AiAction) { return action === 'rewrite' || action === 'chat'; }

export function ArticleAssistant({ entry, workspace, controller, onClose, onBackup }: {
  entry: 'chat' | 'optimize'; workspace: Workspace; controller: ArticleAiController; onClose: () => void; onBackup: () => void;
}) {
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const ai = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [page, setPage] = useState<Page>(entry === 'chat' ? 'chat' : 'menu');
  const [selectedId, setSelectedId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [original, setOriginal] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState(hasConsent);
  const [pending, setPending] = useState<{ action: AiAction; prompt: string } | null>(null);
  const [historyCount, setHistoryCount] = useState(30);
  const restoreBase = useRef<{ title: string; body: string } | null>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const focusPromptOnChat = useRef(false);
  const draft = state.draft;
  const session = workspace.getSession();
  const visibleVersions = session?.versions.filter(item => item.body.trim()) ?? [];
  const chatScroll = useRef<HTMLDivElement>(null);
  const lastTurn = session?.turns.at(-1);
  useEffect(() => { chatScroll.current?.scrollTo({ top: chatScroll.current.scrollHeight }); }, [page, lastTurn?.id, lastTurn?.status]);
  useEffect(() => {
    if (page === 'chat' && focusPromptOnChat.current) { focusPromptOnChat.current = false; promptInput.current?.focus(); }
  }, [page]);
  const busy = ai.busy || saving;
  if (!draft) return null;
  const turn = session?.turns.find(t => t.id === selectedId);
  const version = session?.versions.find(v => v.id === selectedId);
  const base = session?.versions.find(v => v.id === turn?.inputVersionId);
  const stale = Boolean(base && !sameDocument(base, documentOf(draft)));
  const previewTitle = page === 'version' ? '查看记录' : turn && isConversationEdit(turn.action) ? '看看调整后的全文' : '看看优化后的全文';
  const titles: Record<Page, string> = { menu: '文章优化', chat: '和小文聊一聊', preview: previewTitle, history: '修改记录', version: previewTitle, consent: '使用小文前，请您了解' };
  const showTurn = (id: string) => { setSelectedId(id); setOriginal(false); setFeedback(''); setPage('preview'); };
  const showVersion = (id: string) => { setSelectedId(id); restoreBase.current = documentOf(draft); setFeedback(''); setPage('version'); };
  const openChat = (focusPrompt = false) => { focusPromptOnChat.current = focusPrompt; setFeedback(''); setPage('chat'); };
  const run = async (action: AiAction, userPrompt: string) => {
    setFeedback(''); setPage('chat');
    const id = await controller.run(action, userPrompt);
    if (id && ['question', 'rewrite', 'chat'].includes(action)) setPrompt('');
  };
  const request = (action: AiAction, question = '') => {
    if (!consent) { setPending({ action, prompt: question }); setPage('consent'); return; }
    void run(action, question);
  };
  const apply = async () => {
    if (!turn || busy) return;
    setSaving(true);
    const ok = await workspace.applyTurn(turn.id);
    setSaving(false);
    if (ok) { setFeedback(`已应用${isConversationEdit(turn.action) ? '调整' : '优化'}并保存到本机。`); setPage('chat'); }
  };
  const restore = async (target: ArticleVersion, expected: { title: string; body: string }) => {
    if (busy) return;
    setSaving(true);
    const ok = await workspace.restoreVersion(target.id, expected);
    setSaving(false);
    if (ok) { setFeedback('已恢复并保存，其他修改记录仍保留。'); setPage('chat'); }
  };
  const undo = (item: AiTurn) => {
    const before = session?.versions.find(v => v.id === item.inputVersionId);
    const after = session?.versions.find(v => v.id === item.appliedVersionId);
    if (!before || !after) return;
    if (sameDocument(after, documentOf(draft))) void restore(before, after);
    else { showVersion(before.id); setFeedback('应用后正文又有修改，请先核对记录。恢复会替换当前全文。'); }
  };
  const close = () => {
    if (saving) return;
    if (entry === 'optimize' && page !== 'menu') {
      setFeedback('');
      setPage('menu');
      return;
    }
    onClose();
  };
  const compose = () => <form className="ai-composer" onSubmit={event => event.preventDefault()}>
    <label className="visually-hidden" htmlFor="article-ai-question">问问小文</label>
    <textarea ref={promptInput} id="article-ai-question" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} maxLength={2000}
      rows={3} placeholder="问问题，或告诉小文想怎样调整文章" />
    <div className="ai-composer-actions"><button type="button" className="primary-button" disabled={busy || !prompt.trim()} onClick={() => request('chat', prompt)}><Icon name="spark" />发送</button></div>
  </form>;

  return <Dialog className={`article-ai-dialog ai-page-${page}`} title={titles[page]} onClose={close} onBack={page === 'menu' ? undefined : () => {
    setFeedback(''); setPage(page === 'preview' ? 'chat' : page === 'version' ? 'history' : 'menu');
  }}>
    <div className="article-assistant">
      {state.error && <div className="ai-error" role="alert"><p>{state.error}</p><div className="ai-inline-actions">
        <button type="button" disabled={busy} onClick={() => void workspace.checkpoint()}>重试保存</button><button type="button" onClick={onBackup}>导出当前备份</button>
      </div></div>}
      {ai.error && <p className="ai-error" role="alert">{ai.error}</p>}
      {feedback && <p className="ai-feedback" role="status">{feedback}</p>}
      {ai.busy && <div className="ai-progress" role="status"><span><Icon name="spark" />正在处理…</span><button type="button" onClick={() => void controller.cancel()}>取消请求</button></div>}
      {saving && <p role="status">正在保存…</p>}

      {page === 'consent' && <div className="ai-consent">
        <p>使用小文时，这篇文章的标题、正文、相关修改记录和聊天消息会经本地服务发送给 DeepSeek 处理。</p>
        <p>作品和会话保存在当前浏览器。本产品不记录正文或密钥日志；DeepSeek 侧的数据处理适用其服务设置与条款。请勿提交不希望发送的私密内容。</p>
        <p>优化结果需要您确认后才会进入正文。AI 可能出错，请核对人物、时间与细节。</p>
        <div className="ai-result-actions"><button type="button" onClick={() => { setPending(null); setPage('menu'); }}>暂不使用</button>
          <button type="button" className="primary-button" onClick={() => {
            setConsent(true); try { localStorage.setItem(CONSENT_KEY, 'yes'); } catch { /* Session-only consent is sufficient. */ }
            const next = pending; setPending(null); if (next) void run(next.action, next.prompt); else setPage('menu');
          }}>同意并继续</button></div>
      </div>}

      {page === 'menu' && <>
        <button type="button" className="ai-regular" disabled={busy} onClick={() => request('regular')}>
          <span className="ai-tool-heading"><Icon name="spark" /><strong>常规优化</strong></span><b>优化格式，整理通畅</b>
          <span>整理语句、段落和标点，修改错别字，尽量保留您的原意与口吻。</span>
        </button>
        <h3 className="ai-section-title">按需修改</h3>
        <div className="ai-tool-grid">
          <button type="button" disabled={busy} onClick={() => request('polish')}><Icon name="pen" /><b>润色文笔</b><small>改善表达，不新增事实</small></button>
          <button type="button" disabled><Icon name="format" /><b>精简内容</b><small>稍后开放</small></button>
          <button type="button" disabled><Icon name="book" /><b>扩写内容</b><small>稍后开放</small></button>
          <button type="button" disabled><Icon name="image" /><b>添加配图</b><small>稍后开放</small></button>
        </div>
        <button type="button" className="ai-chat-launcher" aria-label="进入小文会话并输入需求" onClick={() => openChat(true)}>
          <span>问问题，或告诉小文想怎样调整文章</span><strong>进入会话<Icon name="chevron" /></strong>
        </button>
        <button type="button" className="ai-record-entry" onClick={() => setPage('history')}><span>修改记录</span><Icon name="chevron" /></button>
      </>}

      {page === 'preview' && turn?.result && base && <>
        <div className="ai-inline-actions"><span className="choice-chip">{ACTION_LABELS[turn.action]} · {turnStateLabel(turn, base.body)}</span>
          <button type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>{original ? '查看优化结果' : '对照原文'}</button></div>
        <div className="ai-summary"><strong>小文的修改说明</strong><p>{resultSummary(turn.result, base.body)}</p></div>
        <div className="ai-full-text" role="region" aria-label={original ? isConversationEdit(turn.action) ? '调整前原文' : '优化前原文' : isConversationEdit(turn.action) ? '调整后全文' : '优化后全文'}>{original ? base.body : turn.result.body}</div>
        <p className="ai-note">{isConversationEdit(turn.action) ? '请核对人物、动作和经历。' : '请核对事实与细节。'}</p>
        {turn.status === 'ready' && stale && <p className="ai-error" role="alert">正文已发生变化。旧结果仅供查看，请根据最新正文重新{isConversationEdit(turn.action) ? '调整' : '优化'}。</p>}
        {turn.status === 'ready' && <div className="ai-result-actions"><button type="button" disabled={busy} onClick={async () => {
          setSaving(true); const ok = await workspace.updateSession(draft.id, current => ({ ...current, turns: current.turns.map(t => t.id === turn.id ? { ...t, status: 'dismissed' } : t) }));
          setSaving(false); if (ok) { setPage('chat'); setFeedback('未采用，正文未变。'); }
        }}>先不修改</button><button type="button" className="primary-button" disabled={busy || stale || Boolean(draft.pendingVoice.trim()) || Boolean(draft.segmentEdit)} onClick={() => void apply()}>应用{isConversationEdit(turn.action) ? '调整' : '优化'}</button></div>}
        {turn.status === 'applied' && <button className="ai-secondary" type="button" disabled={busy} onClick={() => undo(turn)}>撤销这次{isConversationEdit(turn.action) ? '调整' : '优化'}</button>}
        {stale && turn.action !== 'question' && <button className="ai-secondary" type="button" disabled={busy} onClick={() => request(turn.action, isConversationEdit(turn.action) ? turn.prompt : '')}>按最新正文重新{isConversationEdit(turn.action) ? '调整' : '优化'}</button>}
      </>}

      {page === 'chat' && <>
        <div className="ai-inline-actions ai-chat-actions"><button type="button" onClick={() => setPage('history')}>查看修改记录</button></div>
        <div className="ai-conversation" ref={chatScroll} aria-label="文章对话记录">
          {session?.turns.map(item => <div key={item.id} className="ai-turn">
            <div className="message-row user"><div className="message-bubble">{turnPromptLabel(item)}</div></div>
            <div className="message-row assistant"><span className="assistant-avatar" aria-hidden="true"><Icon name="leaf" /></span><div className="ai-assistant-message"><div className="message-bubble">
                {item.result && <strong className="ai-answer-label">{item.result.body ? '小文的修改说明' : '小文的回答'}</strong>}
                <p>{item.result ? resultSummary(item.result, session?.versions.find(v => v.id === item.inputVersionId)?.body ?? '') : item.error || '正在处理…'}</p>
                {Boolean(item.omittedRecords) && <p className="ai-note">较早记录未发送，仍保存在本机。</p>}
                {item.result?.body && <div className="ai-turn-actions"><button type="button" onClick={() => showTurn(item.id)}>查看{isConversationEdit(item.action) ? '调整' : '优化'}结果</button>
                {item.status === 'applied' && <button type="button" disabled={busy} onClick={() => undo(item)}>撤销这次{isConversationEdit(item.action) ? '调整' : '优化'}</button>}</div>}
                {item.result?.citedVersionIds.map((id, i) => <button type="button" key={id} onClick={() => showVersion(id)}>查看引用记录 {i + 1}</button>)}
                {['failed', 'cancelled'].includes(item.status) && <button type="button" disabled={busy} onClick={() => request(item.action, ['question', 'rewrite', 'chat'].includes(item.action) ? item.prompt : '')}>重新{item.action === 'question' ? '提问' : item.action === 'rewrite' ? '调整' : item.action === 'chat' ? '发送' : '生成'}</button>}
              </div><div className="ai-turn-meta"><span className="ai-turn-state">{turnStateLabel(item, session?.versions.find(v => v.id === item.inputVersionId)?.body)}</span><time>{timeLabel(item.createdAt)}</time></div></div></div>
          </div>)}
        </div>
        {compose()}
      </>}

      {page === 'history' && <>
        <p className="ai-note">修改会自动留下记录。以前已经丢失的内容无法找回。</p>
        <div className="ai-version-list">{visibleVersions.slice().reverse().slice(0, historyCount).map(item => <button type="button" key={item.id} onClick={() => showVersion(item.id)}>
          <span><b>{VERSION_LABELS[item.source]}</b><small>{timeLabel(item.createdAt)} · {item.body.length} 字</small></span><Icon name="chevron" />
        </button>)}</div>
        {!visibleVersions.length && <p className="ai-empty">暂无修改记录</p>}
        {visibleVersions.length > historyCount && <button type="button" className="ai-secondary" onClick={() => setHistoryCount(historyCount + 30)}>查看更多记录</button>}
      </>}

      {page === 'version' && version && <>
        <p className="ai-note">{VERSION_LABELS[version.source]} · {timeLabel(version.createdAt)}</p>
        <h3 className="ai-version-title">{version.title || '未命名作品'}</h3><div className="ai-full-text" role="region" aria-label="修改记录正文">{version.body || '（正文为空）'}</div>
        <p className="ai-note">恢复将替换当前标题和全文，当前内容会自动保留。</p>
        <div className="ai-result-actions"><button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(version.body); setFeedback('已复制这份正文。'); }
          catch { setFeedback('浏览器未允许复制，请选中上方文字手动复制。'); }
        }}>复制这份正文</button><button type="button" className="primary-button" disabled={busy} onClick={() => { if (restoreBase.current) void restore(version, restoreBase.current); }}>恢复这份内容</button></div>
      </>}
    </div>
  </Dialog>;
}
