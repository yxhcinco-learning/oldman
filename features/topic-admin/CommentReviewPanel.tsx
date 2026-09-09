'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminComment, AdminCommentPage, AdminCommentReport, AdminReportPage, CommentAudit, CommentReview, CommentState } from '../../packages/core/src/social-protocol';
import styles from './comment-review.module.css';

type Request = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
type QueueState = CommentState | 'resolved';
type Operation = { path: string; body: { operationId: string; expectedVersion: number; reason: string; action?: CommentReview['action'] }; label: string };
const labels: Record<QueueState, string> = { pending: '待审核', approved: '已通过', rejected: '未通过', hidden: '已隐藏', deleted: '已删除', resolved: '已处理' };
const actionLabels: Record<string, string> = { submit: '提交评论', approve: '审核通过', reject: '审核驳回', hide: '隐藏评论', delete: '本人删除', report: '提交举报', resolve: '处理举报', 'report-resolved': '处理举报', purge: '清除正文' };
const displayTime = (value: string) => new Date(value).toLocaleString('zh-CN');
const message = (value: unknown) => value instanceof Error ? value.message : '请求未完成，请重试。';

export function CommentReviewPanel({ request, mode = 'comments' }: { request: Request; mode?: 'comments' | 'reports' }) {
  const reportsMode = mode === 'reports';
  const [state, setState] = useState<QueueState>('pending');
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [reports, setReports] = useState<AdminCommentReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminComment | null>(null);
  const [report, setReport] = useState<AdminCommentReport | null>(null);
  const [audits, setAudits] = useState<CommentAudit[]>([]);
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Operation | null>(null);
  const sequence = useRef(0);
  const writing = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async (next?: string) => {
    const run = ++sequence.current;
    setBusy(true); setError('');
    try {
      const path = `/api/admin/${reportsMode ? 'comment-reports' : 'comments'}?state=${state}${next ? `&cursor=${encodeURIComponent(next)}` : ''}`;
      if (reportsMode) {
        const value = await request<AdminReportPage>(path);
        if (run === sequence.current) { setReports(current => next ? [...current, ...value.reports] : value.reports); setCursor(value.cursor); }
      } else {
        const value = await request<AdminCommentPage>(path);
        if (run === sequence.current) { setComments(current => next ? [...current, ...value.comments] : value.comments); setCursor(value.cursor); }
      }
    } catch (value) { if (run === sequence.current) setError(message(value)); }
    finally { if (run === sequence.current) setBusy(false); }
  }, [request, reportsMode, state]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; invalidate(); };
  }, [load, invalidate]);

  async function open(id: string, selectedReport: AdminCommentReport | null = null) {
    const run = ++sequence.current;
    setBusy(true); setError(''); setNotice(''); setSelected(null); setReport(selectedReport); setAudits([]); setReason(''); setResolution('');
    try {
      const [comment, history] = await Promise.all([
        request<AdminComment>(`/api/admin/comments/${encodeURIComponent(id)}`),
        request<{ entries: CommentAudit[] }>(`/api/admin/comments/${encodeURIComponent(id)}/audit`),
      ]);
      if (run === sequence.current) { setSelected(comment); setAudits(history.entries); }
    } catch (value) { if (run === sequence.current) { setReport(null); setError(message(value)); } }
    finally { if (run === sequence.current) setBusy(false); }
  }
  async function execute(operation: Operation) {
    if (writing.current) return;
    writing.current = true;
    const run = ++sequence.current;
    setPending(operation); setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<AdminComment | AdminCommentReport>(operation.path, { method: 'POST', body: operation.body });
      if (run !== sequence.current) return;
      setPending(null); setReason(''); setResolution(''); setNotice(operation.label);
      if (report && operation.body.action) {
        // Hiding a comment never silently resolves the report; that decision remains explicit.
        setSelected(result as AdminComment);
        const history = await request<{ entries: CommentAudit[] }>(`/api/admin/comments/${encodeURIComponent(report.commentId)}/audit`).catch(() => null);
        if (run === sequence.current) { if (history) setAudits(history.entries); else setError('评论已处理，操作记录暂时无法刷新，请重新打开查看。'); }
      } else {
        setSelected(null); setReport(null); setAudits([]); await load();
      }
    } catch (value) {
      if (run !== sequence.current) return;
      const status = (value as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        setPending(null); setSelected(null); setReport(null); setAudits([]); await load();
        setError(status === 409 ? '评论或举报状态已变化，请重新打开最新记录。' : message(value));
      } else setError(`操作结果尚未确认，请重试原操作。${message(value)}`);
    } finally { writing.current = false; setBusy(false); }
  }
  function act(action: CommentReview['action']) {
    if (!selected || busy || pending) return;
    if (action !== 'approve' && !reason.trim()) { setError('请填写驳回或隐藏原因。'); return; }
    void execute({ path: `/api/admin/comments/${encodeURIComponent(selected.id)}/actions`, body: { operationId: crypto.randomUUID(), expectedVersion: selected.version, action, reason: reason.trim() },
      label: action === 'approve' ? '评论已通过审核。' : action === 'reject' ? '评论已驳回。' : '评论已隐藏，读者不再可见。' });
  }
  function resolveReport() {
    if (!report || busy || pending) return;
    if (!resolution.trim()) { setError('请填写举报处理结论。'); return; }
    void execute({ path: `/api/admin/comment-reports/${encodeURIComponent(report.id)}/resolve`, body: { operationId: crypto.randomUUID(), expectedVersion: report.version, reason: resolution.trim() }, label: '举报已处理，结论已记录。' });
  }
  const blocked = busy || !!pending;
  const states: QueueState[] = reportsMode ? ['pending', 'resolved'] : ['pending', 'approved', 'rejected', 'hidden', 'deleted'];
  return <div className={styles.panel}>
    <header className={styles.header}><h1>{reportsMode ? '举报处理' : '评论审核'}</h1><button disabled={blocked} onClick={() => { setSelected(null); setReport(null); setNotice(''); void load(); }}>刷新列表</button></header>
    <div className={styles.tabs} role="tablist" aria-label={reportsMode ? '举报状态' : '评论状态'}>{states.map(value => <button key={value} role="tab" aria-selected={state === value} disabled={blocked} onClick={() => {
      if (value === state) return;
      setSelected(null); setReport(null); setAudits([]); setNotice(''); setComments([]); setReports([]); setCursor(null); setState(value);
    }}>{reportsMode && value === 'pending' ? '待处理' : labels[value]}</button>)}</div>
    {error && <div className={styles.error} role="alert">{error}</div>}{notice && <div className={styles.notice} role="status">{notice}</div>}
    {pending && <button className={styles.primary} disabled={busy} onClick={() => void execute(pending)}>重试原操作</button>}
    {busy && <p role="status">正在处理…</p>}
    {selected ? <div className={styles.detail}>
      <button className={styles.back} disabled={blocked} onClick={() => { setSelected(null); setReport(null); setNotice(''); }}>返回列表</button>
      <article className={styles.comment} aria-label="评论详情"><div className={styles.identity}><span className={styles.avatar} aria-label="系统默认头像">岁</span><div><strong>{selected.authorName}</strong><small>{displayTime(selected.createdAt)}</small></div><span className={styles.badge}>{labels[selected.state]}</span></div>
        <p className={styles.text}>{selected.text || '评论正文已清除。'}</p>
        <div className={styles.source}>文章：{selected.articleTitle || '文章不可用'}{!selected.articleAvailable && <strong> · 当前不可读</strong>}</div>
        {selected.reason && <p className={styles.reason}>审核原因：{selected.reason}</p>}
      </article>
      {!selected.articleAvailable && <p className={styles.notice}>文章当前不可用，不能通过审核或恢复评论公开。</p>}
      {(selected.state === 'approved' || selected.state === 'pending' && selected.articleAvailable) && <section className={styles.controls} aria-label="评论审核操作">
        <label htmlFor="comment-review-reason">驳回或隐藏原因</label><textarea id="comment-review-reason" maxLength={200} value={reason} disabled={blocked} onChange={event => setReason(event.target.value)} placeholder="最多 200 字" />
        <div className={styles.buttons}>{selected.state === 'pending' && <><button className={styles.primary} disabled={blocked} onClick={() => act('approve')}>通过评论</button><button disabled={blocked} onClick={() => act('reject')}>驳回评论</button></>}
          {selected.state === 'approved' && <button className={styles.danger} disabled={blocked} onClick={() => act('hide')}>隐藏评论</button>}</div>
      </section>}
      {report && <section className={styles.report} aria-label="举报详情"><h2>举报详情</h2><p className={styles.text}>{report.reason || '举报正文已清除。'}</p><small>{displayTime(report.createdAt)} · {report.state === 'pending' ? '待处理' : '已处理'}</small>
        {report.state === 'resolved' ? <p className={styles.reason}>处理结论：{report.resolution || '处理说明已清除。'}</p> : <><label htmlFor="comment-report-resolution">举报处理结论</label><textarea id="comment-report-resolution" maxLength={200} value={resolution} disabled={blocked} onChange={event => setResolution(event.target.value)} placeholder="记录核对结果与处理方式，最多 200 字" />
          <p className={styles.hint}>标记已处理只记录结论；需要停止展示时，请先隐藏评论。</p><button className={styles.primary} disabled={blocked} onClick={resolveReport}>标记已处理</button></>}
      </section>}
      <section className={styles.audit}><h2>操作记录</h2>{audits.length ? audits.map(entry => <div key={entry.id}><strong>{actionLabels[entry.action] ?? entry.action}</strong><small>{entry.actor} · {displayTime(entry.createdAt)} · 版本 {entry.version}</small>{entry.reason && <p>{entry.reason}</p>}</div>) : <p>暂无操作记录。</p>}</section>
    </div> : <div className={styles.list}>{!busy && !(reportsMode ? reports.length : comments.length) && !error && <p className={styles.empty}>{reportsMode ? '暂无这类举报。' : '暂无这类评论。'}</p>}
      {reportsMode ? reports.map(item => <button className={styles.row} key={item.id} disabled={blocked} onClick={() => void open(item.commentId, item)}><span><strong>{item.reason || '举报正文已清除'}</strong><small>{displayTime(item.createdAt)}</small></span><span className={styles.badge}>{item.state === 'pending' ? '待处理' : '已处理'}</span><span aria-hidden>›</span></button>) : comments.map(item => <button className={styles.row} key={item.id} disabled={blocked} onClick={() => void open(item.id)}><span><strong>{item.text || '评论正文已清除'}</strong><small>{item.authorName} · {item.articleTitle || '文章不可用'}</small><small>{displayTime(item.createdAt)}{item.reports > 0 ? ` · ${item.reports} 条举报` : ''}</small></span><span className={styles.badge}>{labels[item.state]}</span><span aria-hidden>›</span></button>)}
      {cursor !== null && <button disabled={blocked} onClick={() => void load(cursor)}>加载更多</button>}
    </div>}
  </div>;
}
