import { Icon, MicIcon } from '../../components/Icons';
import { LetterDrawing, StoryDrawing } from '../../components/Visuals';
import { countWords, formatTime, type Work } from '../../lib/domain/writing';

export function WorksHome({ works, onNew, onOpen, onMenu }: {
  works: Work[]; onNew: () => void; onOpen: (work: Work) => void;
  onMenu: () => void;
}) {
  const visible = works.filter(w => !w.deletedAt);
  // Decorative, stable covers; they do not infer content or persist a new field.
  const cover = (id: string) => ['bike', 'home', 'train'][[...id].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 3];
  return <>
    <div className="home-scroll">
      <div className="brand-row"><span className="brand"><Icon name="leaf" /><b>岁月有声</b></span><button className="round-button" type="button" aria-label="作品与备份选项" onClick={onMenu}><Icon name="more" /></button></div>
      <header className="home-header"><div className="home-intro"><p className="eyebrow">日子慢慢过，文字慢慢写</p><h1>我的作品<span aria-hidden="true">。</span></h1><p className="subtitle">把生活，留在字里行间。</p></div><LetterDrawing /></header>
      <section className="works-section" aria-labelledby="recent-title">
        <div className="section-heading"><h2 id="recent-title">最近写下</h2><span>{visible.length} 篇作品</span></div>
        <div className="work-list">{visible.map(work => (
          <button className="work-card" key={work.id} type="button" onClick={() => onOpen(work)}>
            <span className="work-cover" aria-hidden="true"><StoryDrawing kind={cover(work.id)} /><b>{[...work.title][0]}</b></span>
            <span className="work-copy"><strong>{work.title}</strong><span className="work-topline"><time dateTime={work.updatedAt}>{formatTime(work.updatedAt)}</time><i aria-hidden="true">·</i><span>{countWords(work.segments).toLocaleString()} 字</span></span>
              <span className="work-bottom"><small className="complete">已保存</small><i>继续写 <Icon name="arrow" /></i></span></span>
          </button>
        ))}</div>
        {!visible.length && <div className="empty-library"><p>从想说的一句话开始</p><span>写下的内容会保存在这台设备上</span></div>}
      </section>
    </div>
    <footer className="create-dock"><div className="dock-hint">不必想好开头，从想说的开始。</div><button className="create-button" type="button" onClick={onNew}><MicIcon /><span><strong>开始写作</strong></span><Icon name="arrow" /></button></footer>
  </>;
}
