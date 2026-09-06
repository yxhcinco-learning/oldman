import { errorMessage } from '../../ui/error-message';
import { accountPage } from '../../auth/page';
import { emptyDraft, formatTime, isTopicCurrent, snapshotTopic, type WritingTopic } from '../../domain/core';
import { miniTopics } from '../../network/topics';
import { miniServices } from '../../services';
import { navigationMetrics } from '../../ui/navigation';
import { openLogin } from '../../auth/navigation';

let currentTopic: WritingTopic | null = null;

accountPage({
  data: {
    ...navigationMetrics(),
    loading: true,
    error: '',
    topic: null as WritingTopic | null,
    updatedLabel: '',
    corrected: false,
    stale: false,
    sources: [] as Array<{ id: string; title: string; publisher: string; route: string }>,
  },

  goBack() {
    if (getCurrentPages().length < 2) { void wx.switchTab({ url: '/pages/home/index' }); return; }
    wx.navigateBack({ fail: () => void wx.reLaunch({ url: '/pages/home/index' }) });
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ? decodeURIComponent(options.id) : '';
    void this.loadTopic(id).then(() => {
      if (options.resume === 'interview' && miniServices().account.snapshot().status === 'authenticated' && currentTopic) void this.start('interview');
    });
  },

  async loadTopic(id: string) {
    currentTopic = null;
    this.setData({ loading: true, error: '' });
    try {
      const topic = await miniTopics.detail(id);
      currentTopic = topic;
      this.setData({ loading: false, topic, updatedLabel: formatTime(topic.updatedAt), corrected: topic.status === 'corrected', stale: !isTopicCurrent(topic),
        sources: topic.sources.map(source => ({ id: source.id, title: source.title, publisher: source.publisher,
          route: `/pages/source/index?url=${encodeURIComponent(source.url)}&title=${encodeURIComponent(source.title)}` })) });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '话题暂时无法打开。') });
    }
  },

  async start(mode: 'normal' | 'interview') {
    if (!currentTopic || !isTopicCurrent(currentTopic)) {
      this.setData({ error: '这个话题已不可继续使用，你仍可返回并开始普通写作。' });
      return;
    }
    if (mode === 'interview' && miniServices().account.snapshot().status !== 'authenticated') {
      const state = miniServices().account.snapshot();
      if (state.status === 'offline') { this.setData({ error: '网络不可用，请联网后再开始采访。' }); return; }
      try { await openLogin({ url: '/pages/topic-detail/index?id=' + encodeURIComponent(currentTopic.id) + '&resume=interview' }); }
      catch { this.setData({ error: '登录页暂时无法打开，请重试。' }); }
      return;
    }
    const draft = emptyDraft({ topicSnapshot: snapshotTopic(currentTopic), topicWritingMode: mode });
    try {
      const services = miniServices();
      await services.repository.writeRecovery(draft, 0);
      if (services !== miniServices()) throw new Error('账号已变化，请重新开始写作。');
      const route = mode === 'interview' ? '/pages/interview/index' : '/pages/editor/index';
      void wx.redirectTo({ url: `${route}?id=${encodeURIComponent(draft.id)}` });
    } catch (error) {
      this.setData({ error: errorMessage(error, '暂时无法建立本机草稿。') });
    }
  },

  writeDirectly() { void this.start('normal'); },
  acceptInterview() { void this.start('interview'); },
});
