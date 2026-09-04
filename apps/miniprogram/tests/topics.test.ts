import { describe, expect, it } from 'vitest';
import { isTopicCurrent, type WritingTopic } from '../miniprogram/domain/core';
import { MiniTopicClient, type MiniHttpResponse, type MiniHttpTransport } from '../miniprogram/network/topics';

const topic = (overrides: Partial<WritingTopic> = {}): WritingTopic => ({
  id: 'old-courtyard', revision: 1, status: 'published', kind: 'slow', title: '记忆里的老院子',
  summary: '从院子里的一件小事出发，记录家庭生活、邻里关系和时代留下的日常印记。',
  whyItMatters: '具体的生活细节，比宏大的概括更能留住一个家庭的记忆。',
  updatedAt: '2026-08-31T08:00:00.000Z', publishedAt: '2026-08-31T08:00:00.000Z', expiresAt: null,
  sources: [{ id: 'source-1', title: '家庭记忆写作参考', publisher: '岁月有声', url: 'https://example.com/source', publishedAt: '2026-08-30T08:00:00.000Z' }],
  angles: [{ id: 'angle-1', title: '一个细节', prompt: '院子里最先浮现在您脑海里的一个细节是什么？' }],
  starterQuestion: '先简单介绍一下自己，再说说您和这个院子的关系吧。', tags: ['家庭', '记忆'],
  reviewedBy: 'editor', reviewedAt: '2026-08-31T08:00:00.000Z', ...overrides,
});

class FakeTransport implements MiniHttpTransport {
  requests: Array<{ url: string; timeoutMs: number }> = [];
  constructor(private readonly response: MiniHttpResponse | Error) {}
  async get(url: string, timeoutMs: number) {
    this.requests.push({ url, timeoutMs });
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

describe('小程序审核话题适配', () => {
  it('只返回已审核话题并保持服务端席位顺序', async () => {
    const reviewed = topic({ status: 'corrected', correctionNote: '来源日期已更正。' });
    const expired = topic({ id: 'expired-topic', kind: 'current', expiresAt: '2026-09-01T00:00:00.000Z' });
    const candidate = topic({ id: 'candidate-topic', status: 'candidate', publishedAt: null, reviewedBy: null, reviewedAt: null });
    const transport = new FakeTransport({ statusCode: 200, data: { updatedAt: '2026-09-01T08:00:00.000Z', topics: [candidate, reviewed, expired] } });
    const result = await new MiniTopicClient(transport, 'https://example.test').list({ limit: 5 });
    expect(result.map(item => item.id)).toEqual(['old-courtyard', 'expired-topic']);
    expect(result[0]?.correctionNote).toBe('来源日期已更正。');
    expect(isTopicCurrent(result[1]!, new Date('2026-09-01T08:00:00.000Z'))).toBe(false);
    expect(transport.requests).toEqual([{ url: 'https://example.test/api/topics?limit=5', timeoutMs: 8000 }]);
  });

  it('读取详情和来源，但拒绝未审核详情与无效地址', async () => {
    const transport = new FakeTransport({ statusCode: 200, data: topic() });
    await expect(new MiniTopicClient(transport, 'https://example.test').detail('old-courtyard')).resolves.toMatchObject({
      id: 'old-courtyard', sources: [{ url: 'https://example.com/source' }],
    });
    const unreviewed = new FakeTransport({ statusCode: 200, data: topic({ status: 'draft', publishedAt: null, reviewedBy: null, reviewedAt: null }) });
    await expect(new MiniTopicClient(unreviewed).detail('old-courtyard')).rejects.toThrow('尚未通过审核');
    await expect(new MiniTopicClient(transport).detail('../private')).rejects.toThrow('地址无效');
  });

  it('真实呈现服务、网络和格式错误且不回退到模拟数据', async () => {
    await expect(new MiniTopicClient(new FakeTransport({ statusCode: 401, data: '<html>Authorization Required</html>' })).list())
      .rejects.toThrow('在线服务尚未开放小程序访问');
    await expect(new MiniTopicClient(new FakeTransport({ statusCode: 503, data: { error: '话题服务维护中' } })).list())
      .rejects.toThrow('话题服务维护中');
    await expect(new MiniTopicClient(new FakeTransport(new Error('当前无法连接在线服务，请检查网络后重试。'))).list())
      .rejects.toThrow('当前无法连接在线服务');
    await expect(new MiniTopicClient(new FakeTransport({ statusCode: 200, data: { topics: [{ mock: true }] } })).list())
      .rejects.toThrow('话题数据暂时无法读取');
  });

  it('在没有浏览器 URL 全局对象的微信运行时仍接受完整 HTTPS 来源', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URL');
    Object.defineProperty(globalThis, 'URL', { configurable: true, value: undefined });
    try {
      await expect(new MiniTopicClient(new FakeTransport({
        statusCode: 200,
        data: { updatedAt: '2026-09-01T08:00:00.000Z', topics: [topic()] },
      })).list()).resolves.toMatchObject([{ sources: [{ url: 'https://example.com/source' }] }]);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'URL', descriptor);
      else Reflect.deleteProperty(globalThis, 'URL');
    }
  });
});
