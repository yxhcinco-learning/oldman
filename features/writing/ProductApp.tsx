import { useCallback, useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { IndexedWorkRepository, type WorkRepository } from '../../lib/storage/repository';
import { Workspace } from './workspace';
import { makeBackup, MAX_BACKUP_BYTES } from '../../lib/storage/backup';
import { articleText, effectiveSegments, formatTime, type Work, type Draft } from '../../lib/domain/writing';
import { download, exportText } from '../../lib/domain/download';
import { Dialog } from '../../components/Dialog';
import { ArticleAssistant } from '../ai/ArticleAssistant';
import { ArticleAiController, type AiTransport } from '../ai/session';
import { WorksHome, type HomeSurface } from './WorksHome';
import { Editor } from './Editor';
import { Icon } from '../../components/Icons';
import type { AssistantStatus } from '../../components/WritingControls';
import { snapshotTopic, type WritingTopic } from '../../lib/domain/topics';
import { externalArticleText } from '../../lib/domain/article-ai';
import { topicTransport as defaultTopicTransport, type TopicTransport } from '../topics/client';
import { TopicDetail } from '../topics/TopicDetail';
import { reportProductEvent, type OperationReporter } from '../operations/client';

type Menu = 'library' | 'works' | 'trash' | Work | null;
export function ProductApp({ repository, aiTransport, topicTransport = defaultTopicTransport, operationReporter = reportProductEvent }: {
  repository?: WorkRepository;
  aiTransport?: AiTransport;
  topicTransport?: TopicTransport;
  operationReporter?: OperationReporter;
}) {
  const [workspace] = useState(() => new Workspace(repository ?? new IndexedWorkRepository()));
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const [assistant] = useState(() => new ArticleAiController(workspace, aiTransport));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantComposer, setAssistantComposer] = useState<{ workId: string | null; prompt: string }>({ workId: null, prompt: '' });
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>('idle');
  const [menu, setMenu] = useState<Menu>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [topics, setTopics] = useState<WritingTopic[]>([]);
  const [topicsStatus, setTopicsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedTopic, setSelectedTopic] = useState<WritingTopic | null>(null);
  const [latestTopic, setLatestTopic] = useState<WritingTopic | null>(null);
  const [homeSurface, setHomeSurface] = useState<HomeSurface>('topics');
  const file = useRef<HTMLInputElement>(null);
  const shell = useRef<HTMLElement>(null);
  const assistantOpenRef = useRef(false);
  useEffect(() => operationReporter('app.opened'), [operationReporter]);
  useEffect(() => { void workspace.initialize(); return () => { workspace.dispose(); void assistant.cancel(); }; }, [workspace, assistant]);
  const loadTopics = useCallback(() => {
    topicTransport.list({ limit: 5 }).then(value => { setTopics(value); setTopicsStatus('ready'); }).catch(() => setTopicsStatus('error'));
  }, [topicTransport]);
  useEffect(loadTopics, [loadTopics]);
  useEffect(() => {
    const id = state.draft?.topicSnapshot?.id;
    if (!id) return;
    const controller = new AbortController();
    topicTransport.detail(id, controller.signal).then(setLatestTopic).catch(() => setLatestTopic(null));
    return () => controller.abort();
  }, [state.draft?.topicSnapshot?.id, topicTransport]);
  useEffect(() => assistant.subscribe(() => {
    if (assistantOpenRef.current) return;
    const next = assistant.getSnapshot();
    setAssistantStatus(current => next.busy ? 'processing' : next.error ? 'error' : current === 'processing' ? 'unread' : current);
  }), [assistant]);
  useEffect(() => {
    const element = shell.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    const sync = () => {
      const height = Number.isFinite(viewport.height) && viewport.height > 0 ? Math.round(viewport.height) : 0;
      const offset = Number.isFinite(viewport.offsetTop) ? Math.max(0, Math.round(viewport.offsetTop)) : 0;
      if (height) element.style.setProperty('--visual-viewport-height', `${height}px`);
      else element.style.removeProperty('--visual-viewport-height');
      element.style.setProperty('--visual-viewport-offset', `${offset}px`);
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);
  useEffect(() => {
    const checkpoint = () => { if (document.visibilityState === 'hidden') void workspace.checkpoint(); };
    document.addEventListener('visibilitychange', checkpoint);
    return () => document.removeEventListener('visibilitychange', checkpoint);
  }, [workspace]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); } }, [notice]);
  const backup = () => {
    download('岁月有声-备份.json', makeBackup(state.works, state.draft, state.sessions), 'application/json');
    operationReporter('backup.exported');
    setNotice('已发起备份下载，请妥善保管文件');
  };
  const finish = async () => {
    if (busy) return;
    setBusy(true); await assistant.cancel(); assistantOpenRef.current = false; setAssistantOpen(false); setAssistantComposer({ workId: null, prompt: '' }); setAssistantStatus('idle');
    const ok = await workspace.finish(); setBusy(false); if (ok) setNotice('内容已保存到本机');
  };
  const copy = async (draft: Draft) => {
    const session = state.sessions.find(item => item.workId === draft.id);
    try { await navigator.clipboard.writeText(externalArticleText(articleText(effectiveSegments(draft)), session)); setNotice('正文已复制'); }
    catch { setNotice('浏览器未允许复制，请使用导出 TXT'); }
  };
  const openAssistant = () => { if (state.draft) { void workspace.checkpoint(); assistantOpenRef.current = true; setAssistantStatus('idle'); setAssistantOpen(true); } };
  const startTopic = async (topic: WritingTopic, mode: 'normal' | 'interview') => {
    setSelectedTopic(null);
    setHomeSurface(mode === 'normal' ? 'works' : 'topics');
    await workspace.newWork({ topicSnapshot: snapshotTopic(topic), topicWritingMode: mode });
    operationReporter(mode === 'normal' ? 'writing.started.topic' : 'writing.started.interview');
    if (mode === 'interview') { assistantOpenRef.current = true; setAssistantStatus('idle'); setAssistantOpen(true); }
  };
  const closeAssistant = () => {
    const draft = state.draft;
    const current = assistant.getSnapshot();
    const prompt = assistantComposer.workId === draft?.id ? assistantComposer.prompt.trim() : '';
    const session = draft ? workspace.getSession(draft.id) : undefined;
    const emptyFirstInterview = Boolean(draft?.topicSnapshot && draft.topicWritingMode === 'interview'
      && !draft.title.trim() && !articleText(effectiveSegments(draft)).trim() && !draft.pendingVoice.trim() && !draft.segmentEdit?.text.trim()
      && !draft.materials.length && !prompt && !session?.turns.length && !current.busy);
    assistantOpenRef.current = false; setAssistantOpen(false);
    setAssistantStatus(current.busy ? 'processing' : current.error ? 'error' : 'idle');
    if (emptyFirstInterview) {
      setAssistantComposer({ workId: null, prompt: '' });
      setAssistantStatus('idle');
      setHomeSurface('topics');
      void workspace.finish();
      return;
    }
    if (draft?.topicWritingMode === 'interview') setHomeSurface('works');
  };
  const assistantPrompt = assistantComposer.workId === state.draft?.id ? assistantComposer.prompt : '';
  const menuWorks = state.works.filter(work => Boolean(work.deletedAt) === (menu === 'trash'));
  return <main className="stage"><section ref={shell} className={`phone-shell ${state.draft ? 'app-view editor-screen' : 'home-screen'}`} aria-label="岁月有声写作应用">
    {state.loading ? <div className="loading-state" role="status">正在打开本机作品…</div> : state.draft ? <Editor draft={state.draft} latestTopic={latestTopic} update={draft => { void workspace.update(draft); }} onSave={() => void finish()} onBack={() => void finish()} onAssistant={openAssistant} onInterview={() => { void workspace.update({ ...state.draft!, topicWritingMode: 'interview' }); openAssistant(); }} assistantStatus={assistantStatus} saveStatus={state.saveStatus} /> :
      <WorksHome works={state.works} topics={topics} topicsStatus={topicsStatus} surface={homeSurface} onSurface={setHomeSurface} onRetryTopics={() => { setTopicsStatus('loading'); loadTopics(); }} onTopic={topic => { setSelectedTopic(topic); operationReporter('topic.opened'); }} onNew={() => { setHomeSurface('works'); operationReporter('writing.started.blank'); void workspace.newWork(); }} onOpen={work => { setHomeSurface('works'); void workspace.open(work); }} onMenu={() => setMenu('library')} />}
    {state.error && <div className="storage-error" role="alert"><p>{state.error}</p><div>{state.draft && <button type="button" onClick={() => void workspace.update(state.draft!)}>重试保存</button>}<button type="button" onClick={backup}>导出当前备份</button></div></div>}
    {notice && <div className={`toast ${state.draft ? state.draft.segmentEdit ? 'segment' : `editor ${state.draft.inputMode}` : 'home'}`} role="status">{notice}</div>}
    <input ref={file} hidden type="file" accept=".json,application/json" aria-label="选择备份文件" onChange={async e => {
      const selected = e.target.files?.[0]; e.target.value = '';
      if (!selected) return;
      // Native dialogs sit above toasts/alerts. Return to the library before
      // reporting import results so failures cannot be hidden behind the menu.
      setMenu(null);
      if (selected.size > MAX_BACKUP_BYTES) { setNotice('备份超过 10MB，未导入'); return; }
      setBusy(true);
      try { const count = await workspace.import(await selected.text()); operationReporter('backup.imported'); setNotice(`已恢复 ${count} 篇副本，原作品未改变`); }
      catch (error) { setNotice(error instanceof Error ? error.message : '导入失败，原作品未改变'); }
      finally { setBusy(false); }
    }} />
    {assistantOpen && state.draft && <ArticleAssistant workspace={workspace} controller={assistant} prompt={assistantPrompt} onPromptChange={prompt => setAssistantComposer({ workId: state.draft!.id, prompt })} onBackup={backup} onClose={closeAssistant} />}
    {selectedTopic && <TopicDetail topic={selectedTopic} onClose={() => setSelectedTopic(null)} onStart={mode => void startTopic(selectedTopic, mode)} />}
    {menu && <Dialog title={typeof menu === 'object' ? menu.title : menu === 'library' ? '作品与备份' : menu === 'trash' ? '回收站' : '管理作品'} onClose={() => setMenu(null)}
      onBack={menu === 'library' ? undefined : () => setMenu(typeof menu === 'object' ? menu.deletedAt ? 'trash' : 'works' : 'library')}>
      <div className="menu-actions">
        {menu === 'library' ? <>
          <button type="button" aria-label="管理作品" onClick={() => setMenu('works')}><Icon name="book" /><span>管理作品<small>导出、复制或移入回收站</small></span><Icon name="chevron" /></button>
          <button type="button" aria-label="回收站" onClick={() => setMenu('trash')}><Icon name="undo" /><span>回收站<small>恢复误删的作品</small></span><Icon name="chevron" /></button>
          <button type="button" aria-label="导出全部备份" onClick={() => { backup(); setMenu(null); }}><Icon name="arrow" /><span>导出全部备份<small>保存为 JSON 文件</small></span><Icon name="chevron" /></button>
          <button type="button" aria-label="从备份恢复副本" disabled={busy} onClick={() => file.current?.click()}><Icon name="check" /><span>从备份恢复副本<small>不会覆盖现有作品</small></span><Icon name="chevron" /></button>
          <p>作品只在当前浏览器中。清理浏览器数据可能丢失，请定期备份。</p>
        </> : typeof menu === 'object' ? <>
          <button type="button" onClick={() => { exportText(menu.draft, state.sessions.find(item => item.workId === menu.id)); setMenu(null); }}>导出 TXT</button>
          <button type="button" onClick={() => { void copy(menu.draft); setMenu(null); }}>复制正文</button>
          <button className={menu.deletedAt ? '' : 'danger'} type="button" disabled={busy} onClick={async () => {
            setBusy(true); const ok = await workspace.setDeleted(menu, !menu.deletedAt); setBusy(false);
            setMenu(null);
            if (ok) setNotice(menu.deletedAt ? '作品已恢复' : '已移入回收站，可以随时恢复');
          }}>{menu.deletedAt ? '恢复作品' : '移入回收站'}</button>
        </> : <>
          {menuWorks.map(work => <button className="managed-work" key={work.id} type="button" aria-label={`选择作品：${work.title}`} onClick={() => setMenu(work)}><span>{work.title}</span><small>{formatTime(work.updatedAt)}</small></button>)}
          {!menuWorks.length && <p>{menu === 'trash' ? '回收站是空的' : '还没有作品'}</p>}
        </>}
      </div>
    </Dialog>}
  </section></main>;
}
