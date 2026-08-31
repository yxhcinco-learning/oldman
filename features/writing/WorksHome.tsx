import { Icon, MicIcon } from '../../components/Icons';
import { LetterDrawing, StoryDrawing } from '../../components/Visuals';
import { countWords, formatTime, type Work } from '../../lib/domain/writing';
import type { WritingTopic } from '../../lib/domain/topics';

const kindLabel = { current: '近期', periodic: '时令', slow: '常写常新' } as const;

export function WorksHome({ works, topics, topicsStatus, onNew, onOpen, onTopic, onRetryTopics, onMenu }: {
  works: Work[]; onNew: () => void; onOpen: (work: Work) => void;
  topics: WritingTopic[]; topicsStatus: 'loading' | 'ready' | 'error';
  onTopic: (topic: WritingTopic) => void; onRetryTopics: () => void;
  onMenu: () => void;
}) {
  const visible = works.filter(w => !w.deletedAt);
  // Decorative, stable covers; they do not infer content or persist a new field.
  const cover = (id: string) => ['bike', 'home', 'train'][[...id].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 3];
  return <>
    <div className="home-scroll">
      <div className="brand-row"><span className="brand"><Icon name="leaf" /><b>岁月有声</b></span><button className="round-button" type="button" aria-label="作品与备份选项" onClick={onMenu}><Icon name="more" /></button></div>
      <header className="home-header"><div className="home-intro"><p className="eyebrow">日子慢慢过，文字慢慢写</p><h1>我的作品<span aria-hidden="true">。</span></h1><p className="subtitle">把生活，留在字里行间。</p></div><LetterDrawing /></header>
      <section className="topics-section" aria-labelledby="topics-title">
        <div className="section-heading"><div><p className="eyebrow">编辑为你选了几件事</p><h2 id="topics-title">今日值得写</h2></div><span>最多 5 条</span></div>
        {topicsStatus === 'loading' && <div className="topic-list-state" role="status">正在整理今日议题…</div>}
        {topicsStatus === 'error' && <div className="topic-list-state"><p>议题暂时没有取到，你仍可继续写作和打开作品。</p><button type="button" onClick={onRetryTopics}>重新获取</button></div>}
        {topicsStatus === 'ready' && !topics.length && <div className="topic-list-state"><p>今天还没有新议题，先从自己的近况写起吧。</p></div>}
        {topics.length > 0 && <div className="topic-list">{topics.slice(0, 5).map(topic => <button className="topic-card" key={topic.id} type="button" onClick={() => onTopic(topic)}>
          <span className="topic-card-kind">{kindLabel[topic.kind]}</span><strong>{topic.title}</strong><span>{topic.summary}</span><i>看看背景与角度 <Icon name="arrow" /></i>
        </button>)}</div>}
      </section>
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
