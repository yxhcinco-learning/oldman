import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icons';

export function ConversationTopic({ title, interview, disabled, onToggle }: { title?: string; interview: boolean; disabled: boolean; onToggle: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setDistance(Math.max(0, (text.current?.scrollWidth ?? 0) - (viewport.current?.clientWidth ?? 0)));
    measure();
    if (!viewport.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [title, interview]);
  return <section className={`conversation-topic${!interview ? ' topic-compact' : ''}${!title?.trim() ? ' topic-absent' : ''}`}>
    {title && <div className="topic-heading"><Icon name="book" /><div ref={viewport} className="topic-window" title={title}>
      <span ref={text} className={`topic-text ${distance > 1 ? 'topic-moving' : ''}`} style={{ '--topic-distance': `-${distance}px`, '--topic-duration': `${Math.max(7, distance / 16 + 3)}s` } as CSSProperties}>{title}</span>
    </div></div>}
    <div className="ai-mode-bar">{interview && <span className="topic-state">访谈中</span>}
      <button type="button" disabled={disabled} aria-label={interview ? '访谈已开启，结束访谈并整理' : '开启访谈'} onClick={onToggle}>{interview ? '结束访谈并整理' : '开启访谈'}</button>
    </div>
  </section>;
}
