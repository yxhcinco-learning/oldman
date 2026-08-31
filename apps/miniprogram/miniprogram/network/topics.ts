import { selectHomeTopics, writingTopicSchema, z, type TopicKind, type WritingTopic } from '../domain/core';
import { MINI_API_ORIGIN } from './config';

const topicListSchema = z.object({ updatedAt: z.iso.datetime(), topics: z.array(writingTopicSchema).max(20) }).strict();
const zodParseContext = { jitless: true } as const;

export interface MiniHttpResponse { statusCode: number; data: unknown }
export interface MiniHttpTransport { get(url: string, timeoutMs: number): Promise<MiniHttpResponse> }

export class WxHttpTransport implements MiniHttpTransport {
  get(url: string, timeoutMs: number) {
    return new Promise<MiniHttpResponse>((resolve, reject) => wx.request({ url, method: 'GET', timeout: timeoutMs,
      header: { Accept: 'application/json' }, success: result => resolve({ statusCode: result.statusCode, data: result.data }),
      fail: error => reject(new Error(/timeout/i.test(error.errMsg) ? '请求超时，请检查网络后重试。' : '当前无法连接在线服务，请检查网络后重试。')) }));
  }
}

function readResponse(response: MiniHttpResponse) {
  if (response.statusCode >= 200 && response.statusCode < 300) return response.data;
  const value = response.data as { error?: unknown } | null;
  throw new Error(typeof value?.error === 'string' ? value.error.slice(0, 300) : '话题暂时无法打开。');
}

export class MiniTopicClient {
  constructor(private readonly transport: MiniHttpTransport = new WxHttpTransport(), private readonly origin = MINI_API_ORIGIN) {}

  async list(options: { kind?: TopicKind; limit?: number } = {}): Promise<WritingTopic[]> {
    const query: string[] = [];
    if (options.kind) query.push(`kind=${encodeURIComponent(options.kind)}`);
    query.push(`limit=${Math.max(1, Math.min(20, options.limit ?? 5))}`);
    const parsed = topicListSchema.parse(readResponse(await this.transport.get(`${this.origin}/api/topics?${query.join('&')}`, 8000)), zodParseContext);
    return selectHomeTopics(parsed.topics, options.limit ?? 5);
  }

  async detail(id: string): Promise<WritingTopic> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('话题地址无效。');
    return writingTopicSchema.parse(readResponse(await this.transport.get(`${this.origin}/api/topics/${encodeURIComponent(id)}`, 8000)), zodParseContext);
  }
}

export const miniTopics = new MiniTopicClient();
