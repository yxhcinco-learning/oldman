import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArticleReviewPanel } from '../features/topic-admin/ArticleReviewPanel';
import type { AdminArticle } from '../packages/core/src/publication-protocol';

afterEach(cleanup);
const article: AdminArticle = { id: 'article-1', title: '重读老街', authorName: '岁月作者000001', body: '作者确认的完整正文\n第二段保持原样', aiAssisted: true,
  version: 1, published: false, publishedAt: null, submission: { id: 'submission-1', state: 'pending', reason: '', createdAt: '2026-09-07T00:00:00Z' } };
function setup(mode: 'normal' | 'lost' | 'conflict' = 'normal') {
  let attempts = 0;
  const request = vi.fn(async (path: string, options?: { method?: string; body?: unknown }) => {
    if (options?.method === 'POST') {
      if (mode === 'conflict') throw Object.assign(new Error('状态变化'), { status: 409 });
      if (mode === 'lost' && ++attempts === 1) throw new Error('连接中断');
      return { version: 2 };
    }
    if (path.includes('/submissions/')) return article;
    if (path.endsWith('/audit')) return { entries: [] };
    return { articles: [article], cursor: null };
  });
  render(<ArticleReviewPanel request={request as <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>} />);
  return request;
}
it('展示完整投稿与来源，审核绑定所见投稿，驳回必须有原因', async () => {
  const request = setup();
  fireEvent.click(await screen.findByRole('button', { name: /重读老街/ }));
  expect(await screen.findByText(/作者确认的完整正文/)).toHaveTextContent('第二段保持原样');
  expect(screen.getByText('本文包含 AI 辅助创作内容')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: '驳回' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '驳回' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('请填写简短原因');
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('驳回或下架原因'), { target: { value: '请核对公开信息' } });
  fireEvent.click(screen.getByRole('button', { name: '驳回' }));
  await screen.findByText('已驳回，原因已反馈给作者。');
  expect(request).toHaveBeenCalledWith('/api/admin/articles/article-1/actions', expect.objectContaining({ body: expect.objectContaining({ action: 'reject', reason: '请核对公开信息', expectedVersion: 1, submissionId: 'submission-1' }) }));
});
it('审核结果丢失后重试完全相同的操作 ID 与稿件条件', async () => {
  const request = setup('lost');
  fireEvent.click(await screen.findByRole('button', { name: /重读老街/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: '通过审核' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '通过审核' }));
  fireEvent.click(await screen.findByRole('button', { name: '重试原操作' }));
  await screen.findByText('已通过审核，文章现在可供登录用户阅读。');
  const writes = request.mock.calls.filter(([, options]) => options?.method === 'POST');
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
});
it('旧审核冲突会关闭失效预览并提示重新打开，不自动审核新稿', async () => {
  const request = setup('conflict');
  fireEvent.click(await screen.findByRole('button', { name: /重读老街/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: '通过审核' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '通过审核' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('文章状态已变化');
  expect(screen.queryByText(/作者确认的完整正文/)).not.toBeInTheDocument();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});
