import { Icon, MicIcon } from '../../components/Icons';
import { LetterDrawing, StoryDrawing } from '../../components/Visuals';
import { countWords, formatTime, type Work } from '../../lib/domain/writing';
import type { WritingTopic } from '../../lib/domain/topics';

const kindLabel = { current: '近期', periodic: '时令', slow: '持续关注' } as const;
export type HomeSurface = 'works' | 'topics' | 'profile';

export function WorksHome({ works, topics, topicsStatus, surface, onSurface, onNew, onOpen, onTopic, onRetryTopics, onMenu }: {
  works: Work[]; onNew: () => void; onOpen: (work: Work) => void;
  topics: WritingTopic[]; topicsStatus: 'loading' | 'ready' | 'error';
  surface: HomeSurface; onSurface: (surface: HomeSurface) => void;
  onTopic: (topic: WritingTopic) => void; onRetryTopics: () => void;
  onMenu: () => void;
}) {
  const visible = works.filter(w => !w.deletedAt);
  // Decorative, stable covers; they do not infer content or persist a new field.
  const cover = (id: string) => ['bike', 'home', 'train'][[...id].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 3];
  return <>
    <div className="home-scroll">
      <div className="brand-row"><span className="brand"><Icon name="leaf" /><b>岁月有声</b></span></div>
      {surface === 'works' ? <>
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
          {!visible.length && <div className="empty-library"><p>这里还没有文章</p><span>新文章会保存在这台设备上</span></div>}
        </section>
      </> : surface === 'topics' ? <>
        <header className="home-header topics-header"><div className="home-intro"><p className="eyebrow">最近大家在聊</p><h1>热门话题<span aria-hidden="true">。</span></h1><p className="subtitle">有些新鲜事，也会勾起旧日见闻。</p></div></header>
        <section className="topics-section" aria-labelledby="topics-title">
          <h2 className="visually-hidden" id="topics-title">热门话题</h2>
          {topicsStatus === 'loading' && <div className="topic-list-state" role="status">正在加载热门话题…</div>}
          {topicsStatus === 'error' && <div className="topic-list-state"><p>热门话题暂时没有加载出来。</p><button type="button" onClick={onRetryTopics}>重新加载</button></div>}
          {topicsStatus === 'ready' && !topics.length && <div className="topic-list-state"><p>暂时没有新内容。</p></div>}
          {topics.length > 0 && <div className="topic-list">{topics.slice(0, 5).map(topic => <button className="topic-card" key={topic.id} type="button" aria-label={`${topic.title}，了解详情`} onClick={() => onTopic(topic)}>
            <span className="topic-card-kind">{kindLabel[topic.kind]}</span><strong>{topic.title}</strong><span>{topic.summary}</span><i>了解详情 <Icon name="arrow" /></i>
          </button>)}</div>}
        </section>
      </> : <>
        <header className="home-header profile-header"><div className="home-intro"><p className="eyebrow">本机内容</p><h1>我的<span aria-hidden="true">。</span></h1><p className="subtitle">文章和资料，默认保存在这台设备上。</p></div></header>
        <section className="profile-section" aria-labelledby="profile-tools-title">
          <h2 className="visually-hidden" id="profile-tools-title">我的工具</h2>
          <button className="profile-tool" type="button" aria-label="打开作品与备份" onClick={onMenu}>
            <span className="profile-tool-icon" aria-hidden="true"><Icon name="book" /></span>
            <span><strong>作品与备份</strong><small>管理、导出或恢复这台设备上的文章</small></span>
            <Icon name="chevron" />
          </button>
        </section>
      </>}
    </div>
    {surface === 'works' && <div className="home-create-dock"><button className="create-button home-create-button" type="button" onClick={onNew}><MicIcon /><span><strong>开始写作</strong></span></button></div>}
    <nav className="home-bottom-tabs" role="tablist" aria-label="主要页面">
      <button type="button" role="tab" aria-selected={surface === 'topics'} onClick={() => onSurface('topics')}><span className="home-tab-icon" aria-hidden="true"><Icon name="spark" /></span><span>热门</span></button>
      <button type="button" role="tab" aria-selected={surface === 'works'} onClick={() => onSurface('works')}><span className="home-tab-icon" aria-hidden="true"><Icon name="pen" /></span><span>文章</span></button>
      <button type="button" role="tab" aria-selected={surface === 'profile'} onClick={() => onSurface('profile')}><span className="home-tab-icon" aria-hidden="true"><Icon name="book" /></span><span>我的</span></button>
    </nav>
  </>;
}
