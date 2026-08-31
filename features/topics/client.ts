import { z } from 'zod';
import { writingTopicSchema, type TopicKind, type WritingTopic } from '../../lib/domain/topics';

const topicListSchema = z.object({
  updatedAt: z.iso.datetime(),
  topics: z.array(writingTopicSchema).max(20),
}).strict();

export interface TopicTransport {
  list(options?: { kind?: TopicKind; limit?: number; signal?: AbortSignal }): Promise<WritingTopic[]>;
  detail(id: string, signal?: AbortSignal): Promise<WritingTopic>;
}

export function selectHomeTopics(topics: WritingTopic[], limit = 5) {
  const selected: WritingTopic[] = [];
  const take = (kind: TopicKind, count: number) => {
    for (const topic of topics) {
      if (selected.length >= limit || count <= 0) break;
      if (topic.kind === kind && !selected.some(item => item.id === topic.id)) { selected.push(topic); count--; }
    }
  };
  take('current', 2); take('periodic', 2); take('slow', 1);
  for (const topic of topics) {
    if (selected.length >= limit) break;
    if (!selected.some(item => item.id === topic.id)) selected.push(topic);
  }
  return selected;
}

const readJson = async (response: Response) => {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value && typeof value.error === 'string' ? value.error : '议题暂时无法打开。');
  return value;
};

export const topicTransport: TopicTransport = {
  async list(options = {}) {
    const query = new URLSearchParams();
    if (options.kind) query.set('kind', options.kind);
    query.set('limit', String(Math.max(1, Math.min(20, options.limit ?? 5))));
    const response = await fetch(`/api/topics?${query}`, { signal: options.signal, headers: { Accept: 'application/json' } });
    return topicListSchema.parse(await readJson(response)).topics;
  },
  async detail(id, signal) {
    const response = await fetch(`/api/topics/${encodeURIComponent(id)}`, { signal, headers: { Accept: 'application/json' } });
    return writingTopicSchema.parse(await readJson(response));
  },
};
