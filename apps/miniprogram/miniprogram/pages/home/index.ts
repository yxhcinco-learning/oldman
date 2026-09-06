import { errorMessage } from '../../ui/error-message';
import { accountPage } from '../../auth/page';
import { isTopicCurrent, type WritingTopic } from '../../domain/core';
import { miniTopics } from '../../network/topics';
import { selectTab } from '../../ui/tab-bar';

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

accountPage({
  data: { loading: true, topics: [] as TopicCard[], error: '' },

  onLoad() {
    void this.loadTopics();
  },

  onShow() {
    selectTab(this, 0);
  },

  async loadTopics() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ loading: false, topics: (await miniTopics.list({ limit: 5 })).map(asCard) }); }
    catch (error) {
      const message = errorMessage(error, '热门话题暂时不可用。');
      this.setData({ loading: false, topics: [], error: message });
    }
  },

  openTopic(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    void wx.navigateTo({ url: `/pages/topic-detail/index?id=${encodeURIComponent(id)}` });
  },
});
