import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icons';
import { ACTION_LABELS, VERSION_LABELS, documentOf, sameDocument, resultSummary, type AiAction, type AiTurn, type ArticleVersion } from '../../lib/domain/article-ai';
import { Workspace } from '../writing/workspace';
import { ArticleAiController } from './session';

type Page = 'menu' | 'chat' | 'preview' | 'history' | 'version' | 'consent';
const CONSENT_KEY = 'suiyue-article-ai-consent-v1';
const TURN_LABELS: Record<AiTurn['status'], string> = {
  running: '正在处理', ready: '待您确认', applied: '已应用', dismissed: '未采用', answered: '已回答', failed: '未完成', cancelled: '已取消',
};
function hasConsent() { try { return localStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; } }
function timeLabel(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }

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
  const draft = state.draft;
  const session = workspace.getSession();
  const chatScroll = useRef<HTMLDivElement>(null);
  const lastTurn = session?.turns.at(-1);
  useEffect(() => { chatScroll.current?.scrollTo({ top: chatScroll.current.scrollHeight }); }, [page, lastTurn?.id, lastTurn?.status]);
  const busy = ai.busy || saving;
  if (!draft) return null;
  const turn = session?.turns.find(t => t.id === selectedId);
  const version = session?.versions.find(v => v.id === selectedId);
  const base = session?.versions.find(v => v.id === turn?.inputVersionId);
  const stale = Boolean(base && !sameDocument(base, documentOf(draft)));
  const previewTitle = page === 'version' ? '查看历史版本' : '看看优化后的全文';
  const titles: Record<Page, string> = { menu: '文章优化', chat: '和小文聊一聊', preview: previewTitle, history: '文章版本记录', version: previewTitle, consent: '使用小文前，请您了解' };
  const showTurn = (id: string) => { setSelectedId(id); setOriginal(false); setFeedback(''); setPage('preview'); };
  const showVersion = (id: string) => { setSelectedId(id); restoreBase.current = documentOf(draft); setFeedback(''); setPage('version'); };
  const run = async (action: AiAction, question: string) => {
    setFeedback(''); setPage(action === 'question' ? 'chat' : 'menu');
    const id = await controller.run(action, question);
    if (id && action !== 'question') showTurn(id);
    if (id && action === 'question') setPrompt('');
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
    if (ok) { setFeedback('已应用优化并保存到本机。'); setPage('chat'); }
  };
  const restore = async (target: ArticleVersion, expected: { title: string; body: string }) => {
    if (busy) return;
    setSaving(true);
    const ok = await workspace.restoreVersion(target.id, expected);
    setSaving(false);
    if (ok) { setFeedback('已恢复并保存，其他历史版本仍然保留。'); setPage('chat'); }
  };
  const undo = (item: AiTurn) => {
    const before = session?.versions.find(v => v.id === item.inputVersionId);
    const after = session?.versions.find(v => v.id === item.appliedVersionId);
    if (!before || !after) return;
    if (sameDocument(after, documentOf(draft))) void restore(before, after);
    else { showVersion(before.id); setFeedback('应用后又有修改，请先核对历史版本；恢复会替换当前全文。'); }
  };
  const compose = (compact = false) => <form className={`ai-composer ${compact ? 'compact' : ''}`} onSubmit={event => { event.preventDefault(); request('question', prompt); }}>
    <label className="visually-hidden" htmlFor="article-ai-question">问问小文</label>
    <textarea id="article-ai-question" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} maxLength={2000}
      rows={compact ? 2 : 3} placeholder="问问小文，例如：刚才那一段去哪了？" />
    <button type="submit" className="primary-button" disabled={busy || !prompt.trim()}><Icon name="spark" />{compact ? 'AI 小文' : '发送问题'}</button>
    {!compact && <small>本期支持文字追问；改写请使用常规优化或润色文笔。</small>}
  </form>;

  return <Dialog className={`article-ai-dialog ai-page-${page}`} title={titles[page]} onClose={() => { if (!saving) onClose(); }} onBack={page === 'menu' ? undefined : () => { setFeedback(''); setPage(page === 'version' ? 'history' : 'menu'); }}>
    <div className="article-assistant">
      {state.error && <div className="ai-error" role="alert"><p>{state.error}</p><div className="ai-inline-actions">
        <button type="button" disabled={busy} onClick={() => void workspace.checkpoint()}>重试保存</button><button type="button" onClick={onBackup}>导出当前备份</button>
      </div></div>}
      {ai.error && <p className="ai-error" role="alert">{ai.error}</p>}
      {feedback && <p className="ai-feedback" role="status">{feedback}</p>}
      {ai.busy && <div className="ai-progress" role="status"><span><Icon name="spark" />小文正在阅读和整理，请稍候…</span><button type="button" onClick={() => void controller.cancel()}>取消请求</button></div>}
      {saving && <p role="status">正在保存，请稍候…</p>}

      {page === 'consent' && <div className="ai-consent">
        <p>使用小文时，这篇文章的标题、正文、相关历史版本和聊天消息会经本地服务发送给 DeepSeek 处理。</p>
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
        {compose(true)}
        <div className="ai-inline-actions"><button type="button" onClick={() => setPage('chat')}>查看对话记录</button><button type="button" onClick={() => setPage('history')}>查看历史版本</button></div>
        {session?.turns.filter(t => t.status === 'ready').map(t => <button className="ai-pending-result" type="button" key={t.id} onClick={() => showTurn(t.id)}>{ACTION_LABELS[t.action]} · 有结果待您确认<Icon name="chevron" /></button>)}
      </>}

      {page === 'preview' && turn?.result && base && <>
        <div className="ai-inline-actions"><span className="choice-chip">{ACTION_LABELS[turn.action]} · {TURN_LABELS[turn.status]}</span>
          <button type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>{original ? '查看优化结果' : '对照原文'}</button></div>
        <p className="ai-summary">{resultSummary(turn.result, base.body)}</p>
        <div className="ai-full-text" role="region" aria-label={original ? '优化前原文' : '优化后全文'}>{original ? base.body : turn.result.body}</div>
        <p className="ai-note">请核对事实与细节。确认后保存，优化前的版本会保留。</p>
        {turn.status === 'ready' && stale && <p className="ai-error" role="alert">正文已发生变化。旧结果仅供查看，请根据最新正文重新优化。</p>}
        {turn.status === 'ready' && <div className="ai-result-actions"><button type="button" disabled={busy} onClick={async () => {
          setSaving(true); const ok = await workspace.updateSession(draft.id, current => ({ ...current, turns: current.turns.map(t => t.id === turn.id ? { ...t, status: 'dismissed' } : t) }));
          setSaving(false); if (ok) { setPage('menu'); setFeedback('未采用这次建议，正文没有改变。'); }
        }}>先不修改</button><button type="button" className="primary-button" disabled={busy || stale || Boolean(draft.pendingVoice.trim()) || Boolean(draft.segmentEdit)} onClick={() => void apply()}>应用优化</button></div>}
        {turn.status === 'applied' && <button className="ai-secondary" type="button" disabled={busy} onClick={() => undo(turn)}>撤销这次优化</button>}
        {stale && turn.action !== 'question' && <button className="ai-secondary" type="button" disabled={busy} onClick={() => request(turn.action)}>按最新正文重新优化</button>}
      </>}

      {page === 'chat' && <>
        <div className="ai-inline-actions"><span className="ai-note">这篇文章的对话</span><button type="button" onClick={() => setPage('history')}>查看历史版本</button></div>
        <div className="ai-conversation" ref={chatScroll} aria-label="文章对话记录">
          {!session?.turns.length && <p className="ai-empty">我会结合这篇文章和已保存的修改记录回答。您可以问：“这次改了哪里？”</p>}
          {session?.turns.map(item => <div key={item.id} className="ai-turn">
            <div className="message-row user"><div className="message-bubble">{item.prompt}</div></div>
            <div className="message-row assistant"><span className="assistant-avatar" aria-hidden="true"><Icon name="leaf" /></span><div className="message-bubble">
              <small className="ai-turn-state">{TURN_LABELS[item.status]} · {timeLabel(item.createdAt)}</small>
              <p>{item.result ? resultSummary(item.result, session?.versions.find(v => v.id === item.inputVersionId)?.body ?? '') : item.error || '正在处理，请稍候…'}</p>
              {Boolean(item.omittedRecords) && <p className="ai-note">本次使用当前全文与相关记录，部分较早记录未发送；全部记录仍可在本机查看。</p>}
              {item.result?.body && <button type="button" onClick={() => showTurn(item.id)}>查看优化结果</button>}
              {item.status === 'applied' && <button type="button" disabled={busy} onClick={() => undo(item)}>撤销这次优化</button>}
              {item.result?.citedVersionIds.map((id, i) => <button type="button" key={id} onClick={() => showVersion(id)}>查看引用版本 {i + 1}</button>)}
              {['failed', 'cancelled'].includes(item.status) && <button type="button" disabled={busy} onClick={() => request(item.action, item.action === 'question' ? item.prompt : '')}>重新{item.action === 'question' ? '提问' : '生成'}</button>}
            </div></div>
          </div>)}
        </div>
        {compose()}
      </>}

      {page === 'history' && <>
        <p className="ai-note">输入停顿和重要操作会留下版本。这里从启用记录时开始，不能找回此前已丢失的内容。</p>
        <div className="ai-version-list">{session?.versions.slice().reverse().slice(0, historyCount).map(item => <button type="button" key={item.id} onClick={() => showVersion(item.id)}>
          <span><b>{VERSION_LABELS[item.source]}</b><small>{timeLabel(item.createdAt)} · {item.body.length} 字符</small></span><Icon name="chevron" />
        </button>)}</div>
        {!session?.versions.length && <p className="ai-empty">写下内容后，版本会出现在这里。</p>}
        {(session?.versions.length ?? 0) > historyCount && <button type="button" className="ai-secondary" onClick={() => setHistoryCount(historyCount + 30)}>查看更多版本</button>}
      </>}

      {page === 'version' && version && <>
        <p className="ai-note">{VERSION_LABELS[version.source]} · {timeLabel(version.createdAt)}</p>
        <h3 className="ai-version-title">{version.title || '未命名作品'}</h3><div className="ai-full-text" role="region" aria-label="历史版本正文">{version.body || '（此版本正文为空）'}</div>
        <p className="ai-note">恢复会替换当前标题和全文；当前版本也会保留，您可再次恢复。</p>
        <div className="ai-result-actions"><button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(version.body); setFeedback('已复制这个版本的正文。'); }
          catch { setFeedback('浏览器未允许复制，请选中上方文字手动复制。'); }
        }}>复制版本正文</button><button type="button" className="primary-button" disabled={busy} onClick={() => { if (restoreBase.current) void restore(version, restoreBase.current); }}>确认恢复此版本</button></div>
      </>}
    </div>
  </Dialog>;
}
