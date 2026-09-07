'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminArticle, PublicationAction, PublicationAudit } from '../../packages/core/src/publication-protocol';
import styles from './article-review.module.css';

type Request = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
type List = { articles: AdminArticle[]; cursor: number | null };
const stateLabels = { pending: '待审核', approved: '已通过', rejected: '未通过', withdrawn: '已撤回' };
const actions: Record<string, string> = { submit: '投稿', approve: '审核通过', reject: '驳回', 'withdraw-review': '撤回审核', withdraw: '撤回发表', takedown: '下架', trash: '移入回收站', purge: '永久删除' };
const message = (error: unknown) => error instanceof Error ? error.message : '请求未完成，请重试。';

export function ArticleReviewPanel({ request }: { request: Request }) {
  const [state, setState] = useState<'pending' | 'published' | 'history'>('pending');
  const [list, setList] = useState<List>({ articles: [], cursor: null });
  const [selected, setSelected] = useState<AdminArticle | null>(null);
  const [audits, setAudits] = useState<PublicationAudit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<{ id: string; input: PublicationAction } | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async (cursor = 0) => {
    const run = ++sequence.current;
    setBusy(true); setError('');
    try {
      const result = await request<List>(`/api/admin/articles?state=${state}&cursor=${cursor}`);
      if (run === sequence.current) setList(current => ({ ...result, articles: cursor ? [...current.articles, ...result.articles] : result.articles }));
    } catch (error) { if (run === sequence.current) setError(message(error)); }
    finally { if (run === sequence.current) setBusy(false); }
  }, [request, state]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; invalidate(); };
  }, [load, invalidate]);
  async function open(item: AdminArticle) {
    const run = ++sequence.current;
    setBusy(true); setSelected(null); setAudits([]); setError(''); setNotice(''); setReason('');
    try {
      const detail = await request<AdminArticle>(`/api/admin/articles/${item.id}/submissions/${item.submission.id}`);
      if (run !== sequence.current) return;
      setSelected(detail);
      const result = await request<{ entries: PublicationAudit[] }>(`/api/admin/articles/${item.id}/audit`);
      if (run === sequence.current) setAudits(result.entries);
    } catch (error) { if (run === sequence.current) setError(message(error)); }
    finally { if (run === sequence.current) setBusy(false); }
  }
  async function act(action: 'approve' | 'reject' | 'takedown') {
    if (busy || !selected && !pending) return;
    if (!pending && action !== 'approve' && !reason.trim()) { setError('请填写简短原因。'); return; }
    const operation = pending ?? { id: selected!.id, input: { operationId: crypto.randomUUID(), expectedVersion: selected!.version,
      submissionId: selected!.submission.id, action, reason: reason.trim() } };
    setPending(operation); setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/admin/articles/${operation.id}/actions`, { method: 'POST', body: operation.input });
      setPending(null); setSelected(null); setAudits([]); setReason('');
      setNotice(operation.input.action === 'approve' ? '已通过审核，文章现在可供登录用户阅读。' : operation.input.action === 'reject' ? '已驳回，原因已反馈给作者。' : '已下架，现有待审核稿也已取消。');
      await load();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 409 || status === 400 || status === 404) {
        setPending(null); setSelected(null); await load();
        setError(status === 409 ? '文章状态已变化，请重新打开最新稿件。' : message(error));
      } else setError('操作结果尚未确认，请重试原操作。' + message(error));
    } finally { setBusy(false); }
  }
  return <div className={styles.panel}>
    <header className={styles.header}><div><h1>文章审核</h1><p>查看作者提交的文章，人工确认后发表。</p></div><button disabled={busy || !!pending} onClick={() => { setSelected(null); void load(); }}>刷新列表</button></header>
    <div className={styles.tabs} role="tablist" aria-label="文章状态">{(['pending', 'published', 'history'] as const).map(value =>
      <button key={value} role="tab" aria-selected={state === value} disabled={busy || !!pending} onClick={() => { setSelected(null); setState(value); }}>{value === 'pending' ? '待审核' : value === 'published' ? '已发表' : '审核记录'}</button>)}</div>
    {error && <div className={styles.error} role="alert">{error}</div>}{notice && <div className={styles.notice} role="status">{notice}</div>}
    {pending && <button className={styles.primary} disabled={busy} onClick={() => void act(pending.input.action as 'approve' | 'reject' | 'takedown')}>重试原操作</button>}
    {busy && <p role="status">正在处理…</p>}
    {selected ? <div className={styles.review}>
      <button disabled={busy || !!pending} onClick={() => setSelected(null)}>返回列表</button>
      <article className={styles.article}>
        {/* Authenticated image endpoint; no original or private profile image is used. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.cover} src={`/api/admin/articles/${selected.id}/submissions/${selected.submission.id}/images/reading`} alt="投稿封面" />
        <h2>{selected.title}</h2><p className={styles.author}><span aria-label="系统默认头像">岁</span>{selected.authorName}</p>
        {selected.aiAssisted && <p className={styles.meta}>本文包含 AI 辅助创作内容</p>}
        <div className={styles.body}>{selected.body}</div>
      </article>
      <section className={styles.controls} aria-label="审核操作"><p>{stateLabels[selected.submission.state]} · {new Date(selected.submission.createdAt).toLocaleString('zh-CN')}</p>
        {selected.submission.reason && <p>原因：{selected.submission.reason}</p>}
        {(selected.submission.state === 'pending' || selected.published) && <>
          <label htmlFor="review-reason">驳回或下架原因</label><textarea id="review-reason" maxLength={200} value={reason} disabled={busy || !!pending} onChange={event => setReason(event.target.value)} placeholder="请填写简短原因（最多 200 字）" />
          <div className={styles.buttons}>{selected.submission.state === 'pending' && <><button className={styles.primary} disabled={busy || !!pending} onClick={() => void act('approve')}>通过审核</button><button disabled={busy || !!pending} onClick={() => void act('reject')}>驳回</button></>}
            {selected.published && <button className={styles.danger} disabled={busy || !!pending} onClick={() => void act('takedown')}>下架文章并取消待审稿</button>}</div>
        </>}
      </section>
      <section className={styles.audit}><h2>操作记录</h2>{audits.map(entry => <div key={entry.id}><strong>{actions[entry.action] ?? entry.action}</strong><span>{entry.actor} · {new Date(entry.createdAt).toLocaleString('zh-CN')}</span>{entry.reason && <p>{entry.reason}</p>}</div>)}</section>
    </div> : <div className={styles.list}>{!busy && !list.articles.length && <p className={styles.empty}>这里还没有文章。</p>}
      {list.articles.map(item => <button className={styles.row} key={item.id + item.submission.id} disabled={busy || !!pending} onClick={() => void open(item)}><span><strong>{item.title}</strong><small>{item.authorName} · {new Date(item.submission.createdAt).toLocaleString('zh-CN')}</small></span><span className={styles.badge}>{state === 'published' ? '已发表' : stateLabels[item.submission.state]}</span><span aria-hidden>›</span></button>)}
      {list.cursor !== null && <button disabled={busy || !!pending} onClick={() => void load(list.cursor!)}>加载更多</button>}
    </div>}
  </div>;
}
