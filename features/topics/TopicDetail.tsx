import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icons';
import type { WritingTopic } from '../../lib/domain/topics';
import { formatTime } from '../../lib/domain/writing';
import { topicAngleCopy } from './copy';

const kindLabel = { current: '近期话题', periodic: '时令话题', slow: '持续关注' } as const;

export function TopicDetail({ topic, onClose, onStart }: {
  topic: WritingTopic;
  onClose: () => void;
  onStart: (mode: 'normal' | 'interview') => void;
}) {
  return <Dialog title={topic.title} className="topic-detail-dialog" onClose={onClose}>
    <article className="topic-detail">
      <div className="topic-meta"><span>{kindLabel[topic.kind]}</span><time dateTime={topic.updatedAt}>更新于 {formatTime(topic.updatedAt)}</time></div>
      <p className="topic-summary">{topic.summary}</p>
      <section aria-labelledby="topic-angles-title"><h3 id="topic-angles-title">大家也在关心</h3><ul className="topic-angle-list">{topic.angles.map(angle => <li key={angle.id}>{topicAngleCopy(angle.prompt)}</li>)}</ul></section>
      <section aria-labelledby="topic-sources-title"><h3 id="topic-sources-title">消息来源</h3><ul className="topic-source-list">{topic.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer"><span>{source.title}<small>{source.publisher}</small></span><Icon name="arrow" /></a></li>)}</ul></section>
      {topic.correctionNote && <p className="topic-correction"><strong>更正说明</strong>{topic.correctionNote}</p>}
    </article>
    <div className="topic-start-actions">
      <button type="button" onClick={() => onStart('normal')}>直接写</button>
      <button type="button" className="primary-button" onClick={() => onStart('interview')}>接受小文采访</button>
    </div>
  </Dialog>;
}
