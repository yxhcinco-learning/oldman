import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { IndexedWorkRepository, type WorkRepository } from '../../lib/storage/repository';
import { Workspace } from './workspace';
import { makeBackup, MAX_BACKUP_BYTES } from '../../lib/storage/backup';
import { articleText, effectiveSegments, emptyDraft, type Work, type Draft } from '../../lib/domain/writing';
import { download, exportText } from '../../lib/domain/download';
import { Dialog } from '../../components/Dialog';
import { DemoApp } from '../demo/DemoApp';
import { WorksHome } from './WorksHome';
import { Editor } from './Editor';

type Menu = 'library' | 'editor' | Work | null;
export function ProductApp({ repository }: { repository?: WorkRepository }) {
  const [workspace] = useState(() => new Workspace(repository ?? new IndexedWorkRepository()));
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const [demo, setDemo] = useState<{ source: Draft; entry: 'chat' | 'optimize' | 'editor' } | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void workspace.initialize(); }, [workspace]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); } }, [notice]);
  const backup = () => { download('岁月有声-备份.json', makeBackup(state.works, state.draft), 'application/json'); setNotice('已发起备份下载，请妥善保管文件'); };
  const finish = async () => { if (busy) return; setBusy(true); const ok = await workspace.finish(); setBusy(false); if (ok) setNotice('内容已保存到本机'); };
  const copy = async (draft: Draft) => {
    try { await navigator.clipboard.writeText(articleText(effectiveSegments(draft))); setNotice('正文已复制'); }
    catch { setNotice('浏览器未允许复制，请使用导出 TXT'); }
  };
  const openDemo = (entry: 'chat' | 'optimize' | 'editor') => { setDemo({ source: structuredClone(state.draft ?? emptyDraft()), entry }); };
  if (demo) return <DemoApp source={demo.source} entry={demo.entry} onExit={() => setDemo(null)} />;
  return <main className="stage"><section className={`phone-shell ${state.draft ? 'app-view editor-screen' : 'home-screen'}`} aria-label="岁月有声写作应用">
    {state.loading ? <div className="loading-state" role="status">正在打开本机作品…</div> : state.draft ? <Editor draft={state.draft} update={draft => { void workspace.update(draft); }} onSave={() => void finish()} onBack={() => void finish()} onDemo={openDemo} onMore={() => setMenu('editor')} saveStatus={state.saveStatus} /> :
      <WorksHome works={state.works} onNew={() => void workspace.newWork()} onOpen={work => void workspace.open(work)} onMenu={() => setMenu('library')} onWorkMenu={setMenu} onDemo={() => openDemo('editor')} />}
    {state.error && <div className="storage-error" role="alert"><p>{state.error}</p><div>{state.draft && <button type="button" onClick={() => void workspace.update(state.draft!)}>重试保存</button>}<button type="button" onClick={backup}>导出当前备份</button></div></div>}
    {notice && <div className={`toast ${state.draft ? 'editor' : 'home'}`} role="status">{notice}</div>}
    <input ref={file} className="visually-hidden" type="file" accept=".json,application/json" aria-label="选择备份文件" onChange={async e => {
      const selected = e.target.files?.[0]; e.target.value = '';
      if (!selected) return;
      if (selected.size > MAX_BACKUP_BYTES) { setNotice('备份超过 10MB，未导入'); return; }
      setBusy(true);
      try { const count = await workspace.import(await selected.text()); setNotice(`已恢复 ${count} 篇副本，原作品未改变`); setMenu(null); }
      catch (error) { setNotice(error instanceof Error ? error.message : '导入失败，原作品未改变'); }
      finally { setBusy(false); }
    }} />
    {menu && <Dialog title={typeof menu === 'object' ? menu.title : menu === 'library' ? '作品与备份' : '文章操作'} onClose={() => setMenu(null)}>
      <div className="menu-actions">
        {menu === 'library' ? <><button type="button" onClick={backup}>导出全部备份</button><button type="button" disabled={busy} onClick={() => file.current?.click()}>从备份恢复副本</button><p>作品只在当前浏览器中。清理浏览器数据可能丢失，请定期备份。</p></> : <>
          <button type="button" onClick={() => exportText(typeof menu === 'object' ? menu.draft : state.draft!)}>导出 TXT</button>
          <button type="button" onClick={() => void copy(typeof menu === 'object' ? menu.draft : state.draft!)}>复制正文</button>
          {typeof menu === 'object' ? <button className={menu.deletedAt ? '' : 'danger'} type="button" onClick={async () => { const ok = await workspace.setDeleted(menu, !menu.deletedAt); if (ok) { setNotice(menu.deletedAt ? '作品已恢复' : '已移入回收站，可以随时恢复'); setMenu(null); } }}>{menu.deletedAt ? '恢复作品' : '移入回收站'}</button> : <button type="button" onClick={backup}>导出当前备份</button>}
        </>}
      </div>
    </Dialog>}
  </section></main>;
}
