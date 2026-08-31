import { emptyDraft, isTopicCurrent, snapshotTopic, type WritingTopic } from '../../domain/core';
import { miniTopics } from '../../network/topics';
import { miniServices } from '../../services';

let currentTopic: WritingTopic | null = null;

Page({
  data: {
    loading: true,
    error: '',
    topic: null as WritingTopic | null,
    corrected: false,
    stale: false,
    sources: [] as Array<{ id: string; title: string; publisher: string; route: string }>,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ? decodeURIComponent(options.id) : '';
    void this.loadTopic(id);
  },

  async loadTopic(id: string) {
    currentTopic = null;
    this.setData({ loading: true, error: '' });
    try {
      const topic = await miniTopics.detail(id);
      currentTopic = topic;
      this.setData({ loading: false, topic, corrected: topic.status === 'corrected', stale: !isTopicCurrent(topic),
        sources: topic.sources.map(source => ({ id: source.id, title: source.title, publisher: source.publisher,
          route: `/pages/source/index?url=${encodeURIComponent(source.url)}&title=${encodeURIComponent(source.title)}` })) });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : '话题暂时无法打开。' });
    }
  },

  async start(mode: 'normal' | 'interview') {
    if (!currentTopic || !isTopicCurrent(currentTopic)) {
      this.setData({ error: '这个话题已不可继续使用，你仍可返回并开始普通写作。' });
      return;
    }
    const draft = emptyDraft({ topicSnapshot: snapshotTopic(currentTopic), topicWritingMode: mode });
    try {
      await miniServices().repository.writeRecovery(draft, 0);
      const route = mode === 'interview' ? '/pages/interview/index' : '/pages/editor/index';
      void wx.redirectTo({ url: `${route}?id=${encodeURIComponent(draft.id)}` });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '暂时无法建立本机草稿。' });
    }
  },

  writeDirectly() { void this.start('normal'); },
  acceptInterview() { void this.start('interview'); },
});
