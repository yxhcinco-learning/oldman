import { useState } from 'react';
import { MicIcon } from '../../components/Icons';
import { countWords, formatTime, type Work } from '../../lib/domain/writing';

export function WorksHome({ works, onNew, onOpen, onMenu, onWorkMenu, onDemo }: {
  works: Work[]; onNew: () => void; onOpen: (work: Work) => void;
  onMenu: () => void; onWorkMenu: (work: Work) => void; onDemo: () => void;
}) {
  const [trash, setTrash] = useState(false);
  const visible = works.filter(w => Boolean(w.deletedAt) === trash);
  return <>
    <div className="home-scroll">
      <header className="home-header"><div><p className="eyebrow">岁月有声</p><h1>{trash ? '回收站' : '我的作品'}</h1><p className="subtitle">想说的，慢慢写下来</p></div>
        <button className="round-button" type="button" aria-label="作品与备份选项" onClick={onMenu}>•••</button></header>
      <div className="memory-strip" aria-hidden="true"><span>春</span><i /><span>夏</span><i /><span>秋</span><i /><span>冬</span></div>
      <section className="works-section" aria-labelledby="recent-title">
        <div className="section-heading"><h2 id="recent-title">{trash ? '可以恢复的作品' : '最近写下'}</h2><span>共 {visible.length} 篇</span></div>
        <div className="work-list">{visible.map((work, index) => <div className="work-row" key={work.id}>
          <button className="work-card" type="button" onClick={() => trash ? onWorkMenu(work) : onOpen(work)}>
            <span className={`work-cover ${['amber', 'sage', 'blue', 'rose'][index % 4]}`} aria-hidden="true"><b>{work.title.slice(0, 1)}</b><small>岁月手记</small></span>
            <span className="work-copy"><span className="work-topline"><small>{trash ? '已移除' : '本机保存'}</small><time dateTime={work.updatedAt}>{formatTime(work.updatedAt)}</time></span>
              <strong>{work.title}</strong><span className="work-bottom"><span>{countWords(work.segments)} 字</span><i>{trash ? '恢复作品' : '继续写'}</i></span></span>
          </button><button className="work-menu" type="button" aria-label={`${work.title}的更多操作`} onClick={() => onWorkMenu(work)}>•••</button>
        </div>)}</div>
        {!visible.length && <div className="empty-library"><p>{trash ? '这里还没有作品' : '从想说的一句话开始'}</p><span>{trash ? '移除的作品会暂存在这里' : '写下的内容会保存在这台设备上'}</span></div>}
        <div className="library-links"><button type="button" onClick={() => setTrash(!trash)}>{trash ? '返回作品' : '回收站'}</button><button type="button" onClick={onDemo}>体验 AI 演示</button></div>
      </section>
    </div>
    <footer className="create-dock"><div className="dock-hint">不急，从一句话开始</div><button className="create-button" type="button" onClick={onNew}><MicIcon /><span><strong>开始写作</strong><small>按住说话，也可以打字</small></span><b aria-hidden="true">›</b></button></footer>
  </>;
}
