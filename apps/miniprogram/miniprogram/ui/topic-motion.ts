type TopicPage = { createSelectorQuery: () => WechatMiniprogram.SelectorQuery; setData: (data: Record<string, unknown>) => void };
export function measureTopic(page: TopicPage) {
  wx.nextTick(() => {
    const query = page.createSelectorQuery();
    query.select('.topic-window').boundingClientRect();
    query.select('.topic-text').boundingClientRect();
    query.exec(rects => {
      const [viewport, text] = rects as Array<{ width: number } | null>;
      if (!viewport || !text) return;
      const distance = Math.max(0, text.width - viewport.width);
      page.setData({ topicDistance: distance, topicDuration: Math.max(7, distance / 16 + 3) });
    });
  });
}
