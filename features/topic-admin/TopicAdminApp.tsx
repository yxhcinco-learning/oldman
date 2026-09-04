'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TopicEditableContent, TopicKind, TopicPlacement, WritingTopic } from '../../lib/domain/topics';
import styles from './topic-admin.module.css';

type AdminView = 'topics' | 'new' | 'schedule' | 'history' | 'monitoring';
type StoredRevision = { topic: WritingTopic; editVersion: number; editorBrief: string };
type Placement = TopicPlacement & { id: string };
type Generation = { id: string; topicId: string | null; revision: number | null; brief: string; urls: string[]; webSearchEnabled: boolean;
  model: string; status: string; inputTokens?: number; outputTokens?: number; searchCalls?: number; errorCategory?: string; createdAt: string; completedAt?: string };
type Audit = { id: string; actor: string; action: string; entity: string; entityId: string; summary: Record<string, unknown>; createdAt: string };
type OperationMetric = { requests: number; successes: number; clientErrors: number; serverErrors: number; inputTokens: number; outputTokens: number;
  averageDurationMs: number; p95DurationMs: number; errors: Record<string, number> };
type MonitoringData = {
  capabilities: Record<'aiConfigured' | 'speechConfigured' | 'topicsConfigured' | 'topicAiConfigured' | 'topicAdminConfigured' | 'miniIdentityConfigured', boolean>;
  metrics: { startedAt: string; generatedAt: string; uptimeSeconds: number; lifetime: OperationMetric; last15Minutes: OperationMetric;
    last60Minutes: OperationMetric; actions: Array<OperationMetric & { action: string; lastSeenAt: string }> };
};

const statusLabel: Record<WritingTopic['status'], string> = {
  draft: '草稿', candidate: '待审核', rejected: '已拒绝', published: '已发布', corrected: '已更正', archived: '已下线',
};
const kindLabel: Record<TopicKind, string> = { current: '近期', periodic: '时令', slow: '长期' };
const actionLabel: Record<string, string> = {
  'topic.create': '创建话题', 'topic.update': '保存编辑', 'topic.reject': '拒绝候选', 'topic.publish': '发布话题',
  'topic.correct.create': '创建更正', 'topic.archive': '提前下线', 'topic.schedule.create': '新增排期',
  'topic.schedule.update': '调整排期', 'topic.schedule.delete': '删除排期', 'admin.login': '登录后台', 'admin.logout': '退出后台',
};
const operationLabel: Record<string, string> = {
  health: '健康检查', 'topics.list': '热门列表', 'topics.detail': '话题详情', 'ai.regular': '小文常规修改', 'ai.polish': '小文润色',
  'ai.compose': '小文创作', 'ai.chat': '小文对话', 'ai.question': '小文提问', 'ai.interview': '小文采访',
  'topic.admin.monitoring': '后台监控刷新', 'topic.admin.login': '后台登录', 'topic.admin.session': '后台会话',
  'event.app.opened': '打开应用', 'event.topic.opened': '查看话题', 'event.writing.started.blank': '开始空白写作',
  'event.writing.started.topic': '开始话题写作', 'event.writing.started.interview': '开始采访写作',
  'event.backup.exported': '导出备份', 'event.backup.imported': '导入备份', 'event.report': '事件入口拒绝',
};
const capabilityLabel: Record<keyof MonitoringData['capabilities'], string> = {
  aiConfigured: '文章 AI', speechConfigured: '语音', topicsConfigured: '话题库', topicAiConfigured: '话题 AI',
  topicAdminConfigured: '后台登录', miniIdentityConfigured: '小程序身份',
};

const blankContent = (): TopicEditableContent => ({
  kind: 'slow', title: '', summary: '', whyItMatters: '', expiresAt: null, sources: [],
  angles: [{ id: 'angle-1', title: '', prompt: '' }], starterQuestion: '', tags: [],
});

const localDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const isoDateTime = (value: string) => value ? new Date(value).toISOString() : null;
const displayTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

class AdminRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const value = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) throw new AdminRequestError(response.status, typeof value?.error === 'string' ? value.error : '后台请求失败，请稍后重试。');
  return value as T;
}

async function loadAdminDashboard() {
  const [topicData, generationData, auditData] = await Promise.all([
    fetch('/api/admin/topics', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(response => readResponse<{ topics: StoredRevision[]; placements: Placement[] }>(response)),
    fetch('/api/admin/topic-generations', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(response => readResponse<{ generations: Generation[] }>(response)),
    fetch('/api/admin/audit', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(response => readResponse<{ entries: Audit[] }>(response)),
  ]);
  return { topicData, generationData, auditData };
}

export function TopicAdminApp() {
  const [session, setSession] = useState<{ username: string; csrfToken: string; expiresAt: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<AdminView>('topics');
  const [topics, setTopics] = useState<StoredRevision[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selected, setSelected] = useState<StoredRevision | null>(null);
  const [revisions, setRevisions] = useState<StoredRevision[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = useCallback(async <T,>(path: string, options: { method?: string; body?: unknown; ifMatch?: string | number } = {}) => {
    const method = options.method ?? 'GET';
    const response = await fetch(path, { method, credentials: 'same-origin', headers: {
      Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrfToken ?? '' } : {}),
      ...(options.ifMatch !== undefined ? { 'If-Match': String(options.ifMatch) } : {}),
    }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
    if (response.status === 401) setSession(null);
    return readResponse<T>(response);
  }, [session?.csrfToken]);

  const refresh = useCallback(async () => {
    try {
      const { topicData, generationData, auditData } = await loadAdminDashboard();
      setTopics(topicData.topics); setPlacements(topicData.placements); setGenerations(generationData.generations); setAudits(auditData.entries);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '后台数据暂时无法读取。'); }
  }, []);

  useEffect(() => {
    fetch('/api/admin/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(response => readResponse<{ username: string; csrfToken: string; expiresAt: string }>(response))
      .then(async value => { setSession(value); const { topicData, generationData, auditData } = await loadAdminDashboard();
        setTopics(topicData.topics); setPlacements(topicData.placements); setGenerations(generationData.generations); setAudits(auditData.entries); })
      .catch(() => setSession(null)).finally(() => setChecking(false));
  }, []);

  const chooseTopic = useCallback(async (item: StoredRevision) => {
    setSelected(item); setView('topics'); setError('');
    try {
      const value = await request<{ revisions: StoredRevision[] }>(`/api/admin/topics/${encodeURIComponent(item.topic.id)}/revisions`);
      setRevisions(value.revisions);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '修订历史无法读取。'); }
  }, [request]);

  const handleResult = useCallback(async (message: string, next?: StoredRevision) => {
    setNotice(message); setError('');
    if (next) { setSelected(next); await chooseTopic(next); }
    await refresh();
  }, [chooseTopic, refresh]);

  if (checking) return <main className={styles.center}><p>正在检查后台会话…</p></main>;
  if (!session) return <Login onLogin={value => { setSession(value); void refresh(); }} />;

  return <main className={styles.app}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.mark}>岁月有声</span><span className={styles.brandDivider} /><div><h1>话题编辑台</h1><p>内容运营后台</p></div></div>
      <div className={styles.account}><span className={styles.avatar} aria-hidden="true">{session.username.slice(0, 1).toUpperCase()}</span><span>{session.username}</span><button type="button" onClick={async () => {
        try { await request('/api/admin/auth/session', { method: 'DELETE', body: {} }); } finally { setSession(null); }
      }}>退出</button></div>
    </header>
    <div className={styles.workspace}>
      <nav className={styles.nav} aria-label="后台栏目">
        <span className={styles.navLabel}>工作区</span>
        {([['topics', '话题内容', '▤'], ['new', '生成与新建', '＋'], ['schedule', '首页排期', '▦'], ['history', '生成与审计', '≡'], ['monitoring', '运行监控', '◉']] as Array<[AdminView, string, string]>).map(([id, label, icon]) =>
          <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setError(''); setNotice(''); }}><span aria-hidden="true">{icon}</span>{label}</button>)}
      </nav>
      <section className={styles.content}>
        {(notice || error) && <div role={error ? 'alert' : 'status'} className={error ? styles.error : styles.notice}>{error || notice}</div>}
        {view === 'topics' && <TopicWorkspace topics={topics} selected={selected} revisions={revisions} busy={busy}
          onChoose={chooseTopic} onBusy={setBusy} onError={setError} onResult={handleResult} request={request} />}
        {view === 'new' && <NewTopicPanel busy={busy} onBusy={setBusy} onError={setError} onResult={async value => {
          await handleResult('候选已保存，等待人工确认。', value); setView('topics');
        }} request={request} />}
        {view === 'schedule' && <SchedulePanel topics={topics} placements={placements} busy={busy} request={request}
          onBusy={setBusy} onError={setError} onDone={() => handleResult('排期已更新。')} />}
        {view === 'history' && <HistoryPanel generations={generations} audits={audits} />}
        {view === 'monitoring' && <MonitoringPanel request={request} />}
      </section>
    </div>
  </main>;
}

function Login({ onLogin }: { onLogin: (session: { username: string; csrfToken: string; expiresAt: string }) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <main className={styles.loginPage}><form className={styles.loginCard} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password }) });
      onLogin(await readResponse(response));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败。'); }
    finally { setBusy(false); setPassword(''); }
  }}>
    <span className={styles.mark}>岁月有声 · 内部</span><h1>话题编辑台</h1><p>此页面只供内容编辑使用。</p>
    <label>用户名<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label>
    <label>密码<input autoComplete="current-password" type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <button className={styles.primary} type="submit" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
  </form></main>;
}

type Request = <T>(path: string, options?: { method?: string; body?: unknown; ifMatch?: string | number }) => Promise<T>;

function TopicWorkspace({ topics, selected, revisions, busy, onChoose, onBusy, onError, onResult, request }: {
  topics: StoredRevision[]; selected: StoredRevision | null; revisions: StoredRevision[]; busy: boolean;
  onChoose: (item: StoredRevision) => void; onBusy: (value: boolean) => void; onError: (value: string) => void;
  onResult: (message: string, next?: StoredRevision) => Promise<void>; request: Request;
}) {
  const [status, setStatus] = useState(''); const [kind, setKind] = useState(''); const [query, setQuery] = useState('');
  const visible = useMemo(() => topics.filter(item => (!status || item.topic.status === status) && (!kind || item.topic.kind === kind) &&
    (!query.trim() || `${item.topic.title} ${item.topic.summary}`.toLowerCase().includes(query.trim().toLowerCase()))), [kind, query, status, topics]);
  return <div className={styles.topicLayout}>
    <aside className={styles.topicList}>
      <div className={styles.panelHeading}><div><span>内容库</span><h2>{visible.length} 个话题</h2></div></div>
      <div className={styles.filters}>
        <input aria-label="搜索话题" placeholder="搜索标题或摘要" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="按状态筛选" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(statusLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <select aria-label="按类型筛选" value={kind} onChange={event => setKind(event.target.value)}><option value="">全部类型</option>{Object.entries(kindLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </div>
      <div className={styles.listScroll}>{visible.map(item => <button type="button" key={item.topic.id} className={selected?.topic.id === item.topic.id ? styles.selectedCard : styles.topicCard}
        onClick={() => onChoose(item)}><span><i>{kindLabel[item.topic.kind]}</i><b>{statusLabel[item.topic.status]}</b></span><strong>{item.topic.title}</strong><small>修订 {item.topic.revision} · {displayTime(item.topic.updatedAt)}</small></button>)}
        {!visible.length && <p className={styles.empty}>没有符合条件的话题。</p>}</div>
    </aside>
    <div className={styles.editorPane}>{selected ? <TopicEditor key={`${selected.topic.id}:${selected.topic.revision}:${selected.editVersion}`} value={selected}
      revisions={revisions} busy={busy} onBusy={onBusy} onError={onError} onResult={onResult} request={request} /> :
      <div className={styles.emptyLarge}><span>选择一个话题</span><p>在这里编辑候选、预览用户端内容并执行发布操作。</p></div>}</div>
  </div>;
}

function TopicEditor({ value, revisions, busy, onBusy, onError, onResult, request }: {
  value: StoredRevision; revisions: StoredRevision[]; busy: boolean; onBusy: (value: boolean) => void; onError: (value: string) => void;
  onResult: (message: string, next?: StoredRevision) => Promise<void>; request: Request;
}) {
  const [content, setContent] = useState<TopicEditableContent>(() => ({
    kind: value.topic.kind, title: value.topic.title, summary: value.topic.summary, whyItMatters: value.topic.whyItMatters,
    expiresAt: value.topic.expiresAt, sources: structuredClone(value.topic.sources), angles: structuredClone(value.topic.angles),
    starterQuestion: value.topic.starterQuestion, tags: [...value.topic.tags], ...(value.topic.correctionNote ? { correctionNote: value.topic.correctionNote } : {}),
  }));
  const [publishOpen, setPublishOpen] = useState(false);
  const [slot, setSlot] = useState(1); const [startsAt, setStartsAt] = useState(localDateTime(new Date().toISOString())); const [endsAt, setEndsAt] = useState('');
  const editable = value.topic.status === 'draft' || value.topic.status === 'candidate';
  const formal = value.topic.status === 'published' || value.topic.status === 'corrected';
  const act = async (work: () => Promise<StoredRevision>, message: string) => {
    onBusy(true); onError('');
    try { await onResult(message, await work()); }
    catch (reason) { onError(reason instanceof Error ? reason.message : '操作失败。'); }
    finally { onBusy(false); }
  };
  return <div className={styles.editorGrid}>
    <section className={styles.formPanel}>
      <div className={styles.editorTitle}><div><span>{value.topic.id}</span><h2>{statusLabel[value.topic.status]} · 修订 {value.topic.revision}</h2></div>
        {editable && <button className={styles.primarySmall} disabled={busy} type="button" onClick={() => void act(() => request(`/api/admin/topics/${value.topic.id}/revisions/${value.topic.revision}`,
          { method: 'PATCH', ifMatch: value.editVersion, body: { content } }), '编辑已保存。')}>保存</button>}</div>
      <TopicFields content={content} disabled={!editable || busy} onChange={setContent} />
      <div className={styles.actions}>
        {editable && <><button type="button" disabled={busy} onClick={() => void act(() => request(`/api/admin/topics/${value.topic.id}/revisions/${value.topic.revision}/reject`,
          { method: 'POST', ifMatch: value.editVersion, body: {} }), '候选已拒绝。')}>拒绝</button>
          <button className={styles.primarySmall} type="button" disabled={busy} onClick={() => setPublishOpen(open => !open)}>发布与排期</button></>}
        {formal && <><button type="button" disabled={busy} onClick={() => void act(() => request(`/api/admin/topics/${value.topic.id}/revisions/${value.topic.revision}/correct`,
          { method: 'POST', ifMatch: value.editVersion, body: {} }), '已创建新的更正候选。')}>创建更正</button>
          <button className={styles.danger} type="button" disabled={busy} onClick={() => {
            if (window.confirm('确认立即下线这个话题？用户端将立刻不可见。')) void act(() => request(`/api/admin/topics/${value.topic.id}/revisions/${value.topic.revision}/archive`,
              { method: 'POST', ifMatch: value.editVersion, body: {} }), '话题已提前下线。');
          }}>紧急下线</button></>}
      </div>
      {publishOpen && <div className={styles.publishBox}><h3>发布到首页席位</h3><div className={styles.inlineFields}>
        <label>席位<select value={slot} onChange={event => setSlot(Number(event.target.value))}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>上线时间<input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
        <label>下线时间（可留空）<input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label>
      </div><button className={styles.primarySmall} type="button" disabled={busy || !startsAt} onClick={() => void act(() => request(`/api/admin/topics/${value.topic.id}/revisions/${value.topic.revision}/publish`,
        { method: 'POST', ifMatch: value.editVersion, body: { slot, startsAt: isoDateTime(startsAt), endsAt: isoDateTime(endsAt) } }), '话题已发布并写入排期。')}>确认发布</button></div>}
      <details className={styles.revisions}><summary>修订历史（{revisions.length}）</summary>{revisions.map(item => <div key={item.topic.revision}><b>修订 {item.topic.revision}</b><span>{statusLabel[item.topic.status]} · {displayTime(item.topic.updatedAt)}</span></div>)}</details>
    </section>
    <TopicPreview topic={{ ...value.topic, ...content }} />
  </div>;
}

function TopicFields({ content, disabled, onChange }: { content: TopicEditableContent; disabled: boolean; onChange: (value: TopicEditableContent) => void }) {
  const patch = (value: Partial<TopicEditableContent>) => onChange({ ...content, ...value });
  return <div className={styles.formFields}>
    <div className={styles.inlineFields}><label>类型<select disabled={disabled} value={content.kind} onChange={event => patch({ kind: event.target.value as TopicKind })}>{Object.entries(kindLabel).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
      <label>建议有效期<input disabled={disabled} type="datetime-local" value={localDateTime(content.expiresAt)} onChange={event => patch({ expiresAt: isoDateTime(event.target.value) })} /></label></div>
    <label>标题<input disabled={disabled} value={content.title} maxLength={120} onChange={event => patch({ title: event.target.value })} /></label>
    <label>摘要<textarea disabled={disabled} value={content.summary} maxLength={800} onChange={event => patch({ summary: event.target.value })} /></label>
    <label>内部编辑判断<textarea disabled={disabled} value={content.whyItMatters} maxLength={400} onChange={event => patch({ whyItMatters: event.target.value })} /></label>
    <label>采访首问<textarea disabled={disabled} value={content.starterQuestion} maxLength={300} onChange={event => patch({ starterQuestion: event.target.value })} /></label>
    <label>标签（用顿号或逗号分隔）<input disabled={disabled} value={content.tags.join('、')} onChange={event => patch({ tags: event.target.value.split(/[、,，]/).map(value => value.trim()).filter(Boolean).slice(0, 8) })} /></label>
    {content.correctionNote !== undefined && <label>更正说明<textarea disabled={disabled} value={content.correctionNote} maxLength={500} onChange={event => patch({ correctionNote: event.target.value })} /></label>}
    <fieldset disabled={disabled}><legend>相关切面</legend>{content.angles.map((angle, index) => <div className={styles.repeating} key={angle.id}>
      <input aria-label={`切面 ${index + 1} 标题`} placeholder="短标题" value={angle.title} onChange={event => patch({ angles: content.angles.map((item, at) => at === index ? { ...item, title: event.target.value } : item) })} />
      <textarea aria-label={`切面 ${index + 1} 内容`} placeholder="给用户看的思考切面" value={angle.prompt} onChange={event => patch({ angles: content.angles.map((item, at) => at === index ? { ...item, prompt: event.target.value } : item) })} />
      {content.angles.length > 1 && <button type="button" onClick={() => patch({ angles: content.angles.filter((_, at) => at !== index) })}>移除此项</button>}
    </div>)}{content.angles.length < 4 && <button type="button" onClick={() => patch({ angles: [...content.angles, { id: `angle-${Date.now()}`, title: '', prompt: '' }] })}>＋ 添加切面</button>}</fieldset>
    <fieldset disabled={disabled}><legend>来源（可为零条）</legend>{content.sources.map((source, index) => <div className={styles.repeating} key={source.id}>
      <input aria-label={`来源 ${index + 1} 标题`} placeholder="来源标题" value={source.title} onChange={event => patch({ sources: content.sources.map((item, at) => at === index ? { ...item, title: event.target.value } : item) })} />
      <input aria-label={`来源 ${index + 1} 发布者`} placeholder="发布者" value={source.publisher} onChange={event => patch({ sources: content.sources.map((item, at) => at === index ? { ...item, publisher: event.target.value } : item) })} />
      <input aria-label={`来源 ${index + 1} 链接`} placeholder="https://…" value={source.url} onChange={event => patch({ sources: content.sources.map((item, at) => at === index ? { ...item, url: event.target.value } : item) })} />
      <input aria-label={`来源 ${index + 1} 发布时间`} type="datetime-local" value={localDateTime(source.publishedAt)} onChange={event => patch({ sources: content.sources.map((item, at) => at === index ? { ...item, publishedAt: isoDateTime(event.target.value) ?? '' } : item) })} />
      <button type="button" onClick={() => patch({ sources: content.sources.filter((_, at) => at !== index) })}>移除此来源</button>
    </div>)}{content.sources.length < 5 && <button type="button" onClick={() => patch({ sources: [...content.sources, { id: `source-${Date.now()}`, title: '', publisher: '', url: 'https://', publishedAt: new Date().toISOString() }] })}>＋ 添加来源</button>}</fieldset>
  </div>;
}

function TopicPreview({ topic }: { topic: WritingTopic }) {
  return <aside className={styles.preview}><span>用户端预览</span><article><div><i>{kindLabel[topic.kind]}话题</i>{topic.status === 'corrected' && <b>已更正</b>}</div>
    <h2>{topic.title || '尚未填写标题'}</h2><p>{topic.summary || '填写摘要后会在这里显示。'}</p><h3>大家也在关心</h3>
    <ul>{topic.angles.map(angle => <li key={angle.id}>{angle.prompt || '尚未填写切面'}</li>)}</ul>
    {topic.sources.length > 0 && <><h3>消息来源</h3><ul>{topic.sources.map(source => <li key={source.id}>{source.title || '尚未填写来源标题'} · {source.publisher || '发布者'}</li>)}</ul></>}
    {topic.correctionNote && <div className={styles.correction}><b>更正说明</b>{topic.correctionNote}</div>}
  </article></aside>;
}

function NewTopicPanel({ busy, onBusy, onError, onResult, request }: { busy: boolean; onBusy: (value: boolean) => void; onError: (value: string) => void;
  onResult: (value: StoredRevision) => Promise<void>; request: Request }) {
  const [brief, setBrief] = useState(''); const [urls, setUrls] = useState(''); const [webSearch, setWebSearch] = useState(true);
  const [manual, setManual] = useState(blankContent); const [manualId, setManualId] = useState('');
  const urlValues = urls.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const run = async (work: () => Promise<StoredRevision>, generated = false) => {
    onBusy(true); onError('');
    try { await onResult(await work()); }
    catch (reason) { onError(`${reason instanceof Error ? reason.message : '操作失败。'}${generated ? ' 引子已保留，您可以重试或继续手工新建。' : ''}`); }
    finally { onBusy(false); }
  };
  return <div className={styles.newGrid}><section className={styles.formPanel}><div className={styles.panelHeading}><div><span>AI 候选</span><h2>从一个引子开始</h2></div></div>
    <p className={styles.help}>可输入文字、链接，或两者一起。每次点击只生成一套候选，不会自动重试或发布。</p>
    <label>引子文字<textarea className={styles.seed} maxLength={6000} value={brief} onChange={event => setBrief(event.target.value)} placeholder="例如：社区食堂里的一顿饭，也许能写出退休生活的变化…" /></label>
    <label>参考链接（每行一个，最多 5 个）<textarea value={urls} onChange={event => setUrls(event.target.value)} placeholder="https://example.com/story" /></label>
    <label className={styles.switch}><input type="checkbox" checked={webSearch} disabled={!brief.trim() && urlValues.length > 0} onChange={event => setWebSearch(event.target.checked)} /><span>允许 DeepSeek 联网搜索</span></label>
    {!brief.trim() && urlValues.length > 0 && <p className={styles.hint}>只有链接时必须联网，模型需要阅读链接。</p>}
    <button className={styles.primary} type="button" disabled={busy || (!brief.trim() && !urlValues.length) || urlValues.length > 5} onClick={() => void run(async () => {
      const result = await request<{ topic: StoredRevision }>('/api/admin/topic-generations', { method: 'POST', body: { brief, urls: urlValues, webSearchEnabled: webSearch } });
      return result.topic;
    }, true)}>{busy ? '正在生成…' : '生成一套候选'}</button>
  </section>
  <section className={styles.formPanel}><div className={styles.panelHeading}><div><span>完全手工</span><h2>新建草稿</h2></div></div>
    <label>自定义 ID（可留空）<input value={manualId} onChange={event => setManualId(event.target.value.toLowerCase())} placeholder="如 community-meals" /></label>
    <TopicFields content={manual} disabled={busy} onChange={setManual} />
    <button className={styles.primary} type="button" disabled={busy} onClick={() => void run(() => request('/api/admin/topics', { method: 'POST', body: {
      ...(manualId.trim() ? { id: manualId.trim() } : {}), status: 'draft', content: manual,
    } }))}>保存手工草稿</button>
  </section></div>;
}

function SchedulePanel({ topics, placements, busy, request, onBusy, onError, onDone }: { topics: StoredRevision[]; placements: Placement[]; busy: boolean;
  request: Request; onBusy: (value: boolean) => void; onError: (value: string) => void; onDone: () => Promise<void> }) {
  const formal = topics.filter(item => item.topic.status === 'published' || item.topic.status === 'corrected');
  const [target, setTarget] = useState(formal[0] ? `${formal[0].topic.id}:${formal[0].topic.revision}` : '');
  const [slot, setSlot] = useState(1); const [startsAt, setStartsAt] = useState(localDateTime(new Date().toISOString())); const [endsAt, setEndsAt] = useState('');
  const [editing, setEditing] = useState<Placement | null>(null);
  const act = async (work: () => Promise<unknown>) => { onBusy(true); onError(''); try { await work(); await onDone(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : '排期操作失败。'); } finally { onBusy(false); } };
  return <section><div className={styles.panelHeading}><div><span>完全人工排位</span><h2>首页五席时间表</h2></div></div>
    <p className={styles.help}>同一席位的时间不能重叠；到期后允许空缺，不会自动补位。</p>
    <div className={styles.slotGrid}>{[1, 2, 3, 4, 5].map(number => <section className={styles.slot} key={number}><h3>席位 {number}</h3>
      {placements.filter(item => item.slot === number).map(item => <div className={styles.placement} key={item.id}><b>{item.topicId}</b><span>修订 {item.revision}</span>
        <time>{displayTime(item.startsAt)} → {item.endsAt ? displayTime(item.endsAt) : '持续展示'}</time><div className={styles.placementActions}>
          <button disabled={busy} type="button" onClick={() => { setEditing(item); setTarget(`${item.topicId}:${item.revision}`); setSlot(item.slot);
            setStartsAt(localDateTime(item.startsAt)); setEndsAt(localDateTime(item.endsAt)); }}>调整</button>
          <button className={styles.dangerText} disabled={busy} type="button" onClick={() => void act(() => request(`/api/admin/home-slots/${number}`,
          { method: 'DELETE', ifMatch: item.id, body: { placementId: item.id } }))}>删除排期</button></div></div>)}
      {!placements.some(item => item.slot === number) && <p>暂无排期</p>}</section>)}</div>
    <div className={styles.scheduleForm}><h3>{editing ? '调整现有排期' : '新增排期'}</h3>{formal.length ? <div className={styles.inlineFields}>
      <label>正式话题<select value={target} onChange={event => setTarget(event.target.value)}>{formal.map(item => <option key={item.topic.id} value={`${item.topic.id}:${item.topic.revision}`}>{item.topic.title} · 修订 {item.topic.revision}</option>)}</select></label>
      <label>席位<select value={slot} onChange={event => setSlot(Number(event.target.value))}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>上线时间<input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
      <label>下线时间<input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label>
      </div> : <p className={styles.empty}>当前没有可排期的正式话题。</p>}
      <button className={styles.primarySmall} type="button" disabled={busy || !formal.length || !startsAt} onClick={() => {
        const selected = formal.find(item => `${item.topic.id}:${item.topic.revision}` === target) ?? formal[0]; if (!selected) return;
        void act(() => request(`/api/admin/home-slots/${slot}`, { method: 'PUT', ifMatch: selected.editVersion, body: {
          ...(editing ? { placementId: editing.id } : {}), topicId: selected.topic.id, revision: selected.topic.revision,
          startsAt: isoDateTime(startsAt), endsAt: isoDateTime(endsAt),
        } })).then(() => setEditing(null));
      }}>{editing ? '保存调整' : '写入排期'}</button>
      {editing && <button type="button" disabled={busy} onClick={() => setEditing(null)}>取消调整</button>}
    </div>
  </section>;
}

function HistoryPanel({ generations, audits }: { generations: Generation[]; audits: Audit[] }) {
  return <div className={styles.historyGrid}><section><div className={styles.panelHeading}><div><span>DeepSeek</span><h2>生成记录</h2></div></div>
    <div className={styles.historyList}>{generations.map(item => <article key={item.id}><div><b>{item.status === 'succeeded' ? '成功' : item.status === 'running' ? '进行中' : '未生成'}</b><time>{displayTime(item.createdAt)}</time></div>
      <p>{item.brief || item.urls.join('、') || '无文字引子'}</p><small>{item.model} · 联网 {item.webSearchEnabled ? '开' : '关'} · 搜索 {item.searchCalls ?? '—'} 次 · token {item.inputTokens ?? '—'} / {item.outputTokens ?? '—'}{item.errorCategory ? ` · ${item.errorCategory}` : ''}</small></article>)}
      {!generations.length && <p className={styles.empty}>还没有生成记录。</p>}</div></section>
    <section><div className={styles.panelHeading}><div><span>操作留痕</span><h2>审计记录</h2></div></div>
      <div className={styles.historyList}>{audits.map(item => <article key={item.id}><div><b>{actionLabel[item.action] ?? item.action}</b><time>{displayTime(item.createdAt)}</time></div>
        <p>{item.entityId}</p><small>{item.actor} · {Object.entries(item.summary).map(([key, value]) => `${key}: ${String(value ?? '—')}`).join(' · ') || '无敏感详情'}</small></article>)}
        {!audits.length && <p className={styles.empty}>还没有操作记录。</p>}</div></section></div>;
}

const successRate = (metric: OperationMetric) => metric.requests ? `${Math.round(metric.successes / metric.requests * 100)}%` : '—';
const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86_400); const hours = Math.floor(seconds % 86_400 / 3_600); const minutes = Math.floor(seconds % 3_600 / 60);
  return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', `${minutes} 分钟`].filter(Boolean).join(' ');
};

function MonitoringPanel({ request }: { request: Request }) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await request<MonitoringData>('/api/admin/monitoring')); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '监控数据暂时无法读取。'); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const errors = data?.metrics.actions.flatMap(action => Object.entries(action.errors).map(([category, count]) => ({ action: action.action, category, count })))
    .sort((left, right) => right.count - left.count) ?? [];
  return <section className={styles.monitoring}>
    <div className={styles.pageHeading}><div><h2>运行监控</h2><p>仅显示当前网关进程的匿名聚合数据，服务重启后清零。</p></div>
      <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '立即刷新'}</button></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {data && <>
      <div className={styles.runtimeBar}><div><span className={styles.liveDot} />当前进程运行正常</div><span>启动于 {displayTime(data.metrics.startedAt)} · 已运行 {formatUptime(data.metrics.uptimeSeconds)}</span><span>更新于 {displayTime(data.metrics.generatedAt)}</span></div>
      <div className={styles.capabilities}>{Object.entries(data.capabilities).map(([key, configured]) => <span className={configured ? styles.capabilityOn : styles.capabilityOff} key={key}>
        <i aria-hidden="true" />{capabilityLabel[key as keyof MonitoringData['capabilities']]}<b>{configured ? '已配置' : '未配置'}</b></span>)}</div>
      <div className={styles.metricGrid}>
        <article><span>近 15 分钟请求</span><strong>{data.metrics.last15Minutes.requests}</strong><small>近 60 分钟 {data.metrics.last60Minutes.requests}</small></article>
        <article><span>近 15 分钟成功率</span><strong>{successRate(data.metrics.last15Minutes)}</strong><small>成功 {data.metrics.last15Minutes.successes} 次</small></article>
        <article><span>近 15 分钟服务错误</span><strong>{data.metrics.last15Minutes.serverErrors}</strong><small>客户端拒绝 {data.metrics.last15Minutes.clientErrors}</small></article>
        <article><span>进程累计 token</span><strong>{data.metrics.lifetime.inputTokens + data.metrics.lifetime.outputTokens}</strong><small>输入 {data.metrics.lifetime.inputTokens} · 输出 {data.metrics.lifetime.outputTokens}</small></article>
      </div>
      <div className={styles.monitorGrid}>
        <section className={styles.dataPanel}><div className={styles.dataPanelTitle}><div><h3>动作汇总</h3><p>固定动作名，不包含请求内容或用户标识</p></div><span>{data.metrics.actions.length} 类</span></div>
          <div className={styles.tableScroll}><table><thead><tr><th>动作</th><th>请求</th><th>成功率</th><th>P95</th><th>最近发生</th></tr></thead><tbody>
            {data.metrics.actions.map(action => <tr key={action.action}><td><b>{operationLabel[action.action] ?? action.action}</b><small>{action.action}</small></td><td>{action.requests}</td>
              <td>{successRate(action)}</td><td>{action.p95DurationMs} ms</td><td>{displayTime(action.lastSeenAt)}</td></tr>)}
            {!data.metrics.actions.length && <tr><td colSpan={5} className={styles.tableEmpty}>当前进程还没有操作记录。</td></tr>}
          </tbody></table></div>
        </section>
        <section className={styles.dataPanel}><div className={styles.dataPanelTitle}><div><h3>错误分类</h3><p>仅保留固定分类与累计次数</p></div><span>{errors.reduce((total, item) => total + item.count, 0)} 次</span></div>
          <div className={styles.errorList}>{errors.map(item => <article key={`${item.action}:${item.category}`}><div><b>{item.category}</b><span>{item.count}</span></div><small>{operationLabel[item.action] ?? item.action}</small></article>)}
            {!errors.length && <div className={styles.healthyEmpty}><span>✓</span><b>当前没有错误记录</b><p>系统只保存聚合次数，不保存原始请求。</p></div>}
          </div>
        </section>
      </div>
    </>}
    {!data && loading && <div className={styles.loadingPanel}>正在读取当前进程指标…</div>}
  </section>;
}
