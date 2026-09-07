import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniPublicationClient } from '../miniprogram/publication/client';
import type { AccountPlatform, MiniSessionAuthorizer } from '../miniprogram/auth/account-client';
import type { miniServices } from '../miniprogram/services';

const context = vi.hoisted(() => ({ services: {} as ReturnType<typeof miniServices> }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => context.services }));
vi.mock('../miniprogram/auth/page', () => ({ accountPage: (value: object) => Page(value) }));
vi.mock('../miniprogram/ui/tab-bar', () => ({ selectTab: () => {} }));
afterEach(() => { vi.unstubAllGlobals(); });

interface ArticlesPage {
  data: { cards: unknown[]; error: string; loading: boolean; empty: boolean; cursor: string | null };
  load(more?: boolean): Promise<void>;
  onHide(): void;
  setData(value: object): void;
}
async function fixture() {
  vi.resetModules();
  const request = vi.fn<AccountPlatform['request']>();
  const authorizer = { authorizedRequest: <T>(action: (token: string) => Promise<T>) => action('isolated-session') } as MiniSessionAuthorizer;
  const client = new MiniPublicationClient(authorizer, { request } as AccountPlatform);
  context.services = { publications: client } as ReturnType<typeof miniServices>;
  let definition!: ArticlesPage;
  vi.stubGlobal('Page', (value: ArticlesPage) => { definition = value; });
  await import('../miniprogram/pages/articles/index');
  const page = { ...definition, data: structuredClone(definition.data), setData(value: object) { Object.assign(this.data, value); } };
  return { request, client, page };
}

describe('公共文章列表的真实空状态与请求失败', () => {
  it('成功返回空数组才展示空列表，失败后重试会清除旧错误', async () => {
    const s = await fixture();
    s.request.mockResolvedValueOnce({ statusCode: 404, data: '<html>404 Not Found</html>' });
    await s.page.load();
    expect(s.page.data).toMatchObject({ cards: [], error: '文章列表暂时无法读取，请稍后重试。', loading: false });
    s.request.mockResolvedValueOnce({ statusCode: 200, data: { articles: [], cursor: null } });
    await s.page.load();
    expect(s.page.data).toEqual({ cards: [], error: '', loading: false, cursor: null, empty: true });
    s.request.mockResolvedValueOnce({ statusCode: 200, data: { articles: [{ id: 'published', title: '留下文字', authorName: '岁月作者000001', publishedAt: '2026-09-07T00:00:00.000Z', version: 1 }], cursor: null } });
    s.request.mockRejectedValueOnce(new Error('Image temporarily unavailable'));
    await s.page.load();
    expect(s.page.data).toMatchObject({ empty: false, error: '', loading: false });
    expect(s.page.data.cards).toHaveLength(1);
    s.page.onHide();
    expect(s.page.data).toMatchObject({ cards: [], empty: false });
  });

  it('列表 404 不使用单篇失效文案，但下架详情继续使用统一提示', async () => {
    const s = await fixture();
    s.request.mockResolvedValue({ statusCode: 404, data: { code: 'article_unavailable', error: '这篇文章暂时无法查看。' } });
    await expect(s.client.list('next-page')).rejects.toMatchObject({ status: 404, message: '文章列表暂时无法读取，请稍后重试。' });
    await expect(s.client.article('withdrawn-article')).rejects.toMatchObject({ status: 404, message: '这篇文章暂时无法查看。' });
  });

  it('断网、服务失败和正在读取都不能冒充已确认的空库', async () => {
    const s = await fixture();
    s.request.mockRejectedValueOnce(new Error('网络不可用，请稍后重试。'));
    await s.page.load(); expect(s.page.data.error).toContain('网络不可用');
    let finish!: (value: { statusCode: number; data: object }) => void;
    s.request.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = s.page.load();
    expect(s.page.data).toMatchObject({ loading: true, error: '', empty: false });
    finish({ statusCode: 503, data: {} }); await pending;
    expect(s.page.data).toMatchObject({ loading: false, error: '文章列表暂时无法读取，请稍后重试。', empty: false });
  });
});
