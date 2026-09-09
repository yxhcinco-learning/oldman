'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './social-metrics.module.css';

type DailyMetric = { day: string; event: string; action: string; count: number };
type Request = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
const stages = [
  ['share_entry_open', '分享来源阅读'], ['login_intent', '互动登录意图'], ['login_success', '互动登录成功'],
  ['interaction_confirmed', '已确认互动'], ['return_visit', '再次访问'],
] as const;
const actions = [['like', '点赞 / 取消'], ['collect', '收藏 / 取消'], ['comment', '评论提交'], ['gift', '小花花送达'], ['follow', '关注 / 取消']] as const;

export function SocialMetricsPanel({ request }: { request: Request }) {
  const [days, setDays] = useState<DailyMetric[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setDays((await request<{ days: DailyMetric[] }>('/api/admin/social/metrics')).days); }
    catch (value) { setError(value instanceof Error ? value.message : '互动汇总暂时无法读取。'); }
    finally { setBusy(false); }
  }, [request]);
  useEffect(() => {
    let active = true;
    void request<{ days: DailyMetric[] }>('/api/admin/social/metrics').then(value => { if (active) setDays(value.days); })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : '互动汇总暂时无法读取。'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [request]);
  const totals = useMemo(() => Object.fromEntries(stages.map(([event]) => [event, days?.filter(item => item.event === event).reduce((sum, item) => sum + item.count, 0) ?? 0])), [days]);
  return <section className={styles.panel} aria-labelledby="social-metrics-title">
    <header><div><h2 id="social-metrics-title">读者互动汇总</h2><p>近 90 天 · 上海时区 · 事件次数</p></div><button disabled={busy} onClick={() => void load()}>{busy ? '刷新中…' : '刷新互动汇总'}</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {days ? <>
      <div className={styles.stages}>{stages.map(([event, label]) => <article key={event}><span>{label}</span><strong>{totals[event].toLocaleString('zh-CN')}</strong></article>)}</div>
      <div className={styles.actions} aria-label="已确认互动分类">{actions.map(([action, label]) => <div key={action}><span>{label}</span><strong>{days.filter(item => item.event === 'interaction_confirmed' && item.action === action).reduce((sum, item) => sum + item.count, 0).toLocaleString('zh-CN')}</strong></div>)}</div>
      <p className={styles.note}>登录意图与登录成功按互动入口统计；已确认互动来自服务端成功操作，包含取消点赞、收藏和关注。评论提交不代表审核通过，打开赠礼面板不计为送达。这里仅展示去重事件的日汇总，不等同于人数，不展示个人轨迹。</p>
      {!days.length && <p className={styles.empty}>这段时间还没有互动记录。</p>}
    </> : !error && <p role="status">正在读取互动汇总…</p>}
  </section>;
}
