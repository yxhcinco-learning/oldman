import { MicIcon } from '../../components/Icons';
import { countWords, formatTime, type Work } from '../../lib/domain/writing';

export function WorksHome({ works, onNew, onOpen, onMenu }: {
  works: Work[]; onNew: () => void; onOpen: (work: Work) => void;
  onMenu: () => void;
}) {
  const visible = works.filter(w => !w.deletedAt);
  return <>
    <div className="home-scroll">
      <header className="home-header"><div><p className="eyebrow">岁月有声</p><h1>我的作品</h1><p className="subtitle">想说的，慢慢写下来</p></div>
        <button className="round-button" type="button" aria-label="作品与备份选项" onClick={onMenu}>•••</button></header>
      <div className="memory-strip" aria-hidden="true"><span>春</span><i /><span>夏</span><i /><span>秋</span><i /><span>冬</span></div>
      <section className="works-section" aria-labelledby="recent-title">
        <div className="section-heading"><h2 id="recent-title">最近写下</h2><span>共 {visible.length} 篇</span></div>
        <div className="work-list">{visible.map((work, index) => (
          <button className="work-card" key={work.id} type="button" onClick={() => onOpen(work)}>
            <span className={`work-cover ${['amber', 'sage', 'blue', 'rose'][index % 4]}`} aria-hidden="true"><b>{work.title.slice(0, 1)}</b><small>岁月手记</small></span>
            <span className="work-copy"><span className="work-topline"><small>已保存</small><time dateTime={work.updatedAt}>{formatTime(work.updatedAt)}</time></span>
              <strong>{work.title}</strong><span className="work-bottom"><span>{countWords(work.segments).toLocaleString()} 字</span><i>继续写</i></span></span>
          </button>
        ))}</div>
        {!visible.length && <div className="empty-library"><p>从想说的一句话开始</p><span>写下的内容会保存在这台设备上</span></div>}
      </section>
    </div>
    <footer className="create-dock"><div className="dock-hint"><span aria-hidden="true">✦</span> 不知道写什么？先说一句就好</div><button className="create-button" type="button" onClick={onNew}><MicIcon /><span><strong>开始写作</strong><small>按住说话，也可以打字</small></span><b aria-hidden="true">›</b></button></footer>
  </>;
}
