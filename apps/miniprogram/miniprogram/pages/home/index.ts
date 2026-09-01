import { isTopicCurrent, type WritingTopic } from '../../domain/core';
import { miniTopics } from '../../network/topics';

interface TopicCard {
  id: string;
  kind: string;
  title: string;
  summary: string;
  corrected: boolean;
  stale: boolean;
}

const kindLabel = { current: '近期', periodic: '时令', slow: '持续关注' } as const;
const asCard = (topic: WritingTopic): TopicCard => ({ id: topic.id, kind: kindLabel[topic.kind], title: topic.title, summary: topic.summary,
  corrected: topic.status === 'corrected', stale: !isTopicCurrent(topic) });

Page({
  data: { loading: true, topics: [] as TopicCard[], error: '' },

  onLoad() {
    void this.loadTopics();
  },

  async loadTopics() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ loading: false, topics: (await miniTopics.list({ limit: 5 })).map(asCard) }); }
    catch { this.setData({ loading: false, topics: [], error: '热门话题暂时不可用，不影响本机写作。' }); }
  },

  openTopic(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    void wx.navigateTo({ url: `/pages/topic-detail/index?id=${encodeURIComponent(id)}` });
  },
});
