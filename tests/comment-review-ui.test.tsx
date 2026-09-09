import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommentReviewPanel } from '../features/topic-admin/CommentReviewPanel';
import { TopicAdminApp } from '../features/topic-admin/TopicAdminApp';
import { SocialMetricsPanel } from '../features/topic-admin/SocialMetricsPanel';
import type { AdminComment, AdminCommentReport } from '../packages/core/src/social-protocol';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const comment: AdminComment = { id: 'comment-1', articleId: 'article-1', publicAuthorId: 'author-1', authorName: '读者甲', avatar: 'default', text: '老街的故事，让我想起家。\n<script>保留为文字</script>', createdAt: '2026-09-09T01:00:00Z', version: 3, state: 'pending', reason: '', articleTitle: '老街的清晨', articleAvailable: true, reports: 1 };
const report: AdminCommentReport = { id: 'report-1', commentId: comment.id, reason: '疑似包含不适宜公开的信息', state: 'pending', version: 2, createdAt: comment.createdAt, resolution: '' };
type Request = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
function setup(options: { failure?: 'lost' | 'conflict' | 'forbidden'; mode?: 'comments' | 'reports'; item?: AdminComment; pages?: boolean } = {}) {
  let current = { ...(options.item ?? comment) };
  let currentReport = { ...report };
  let writes = 0;
  const request = vi.fn(async (path: string, input?: { method?: string; body?: unknown }) => {
    if (input?.method === 'POST') {
      writes++;
      if (options.failure === 'conflict') throw Object.assign(new Error('状态变化'), { status: 409 });
      if (options.failure === 'forbidden') throw Object.assign(new Error('后台权限校验未通过。'), { status: 403 });
      if (options.failure === 'lost' && writes === 1) throw new Error('连接中断');
      if (path.endsWith('/resolve')) { currentReport = { ...currentReport, state: 'resolved', version: 3, resolution: (input.body as { reason: string }).reason }; return currentReport; }
      const action = (input.body as { action: string }).action;
      current = { ...current, state: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'hidden', version: current.version + 1 };
      return current;
    }
    if (path.endsWith('/audit')) return { entries: [{ id: 1, action: 'submit', actor: '读者', version: 1, reason: '', createdAt: comment.createdAt }] };
    if (path === '/api/admin/comments/comment-1') return current;
    if (path.startsWith('/api/admin/comment-reports?')) return { reports: new URLSearchParams(path.split('?')[1]).get('state') === currentReport.state ? [currentReport] : [], cursor: null };
    if (path.includes('cursor=')) return { comments: [{ ...current, id: 'comment-2', text: '第二页评论' }], cursor: null };
    return { comments: new URLSearchParams(path.split('?')[1]).get('state') === current.state ? [current] : [], cursor: options.pages ? 'next/comment' : null };
  });
  render(<CommentReviewPanel request={request as Request} mode={options.mode} />);
  return request;
}
async function openComment() { fireEvent.click(await screen.findByRole('button', { name: /老街的故事/ })); await screen.findByRole('article', { name: '评论详情' }); }
async function openReport() { fireEvent.click(await screen.findByRole('button', { name: /疑似包含/ })); await screen.findByRole('region', { name: '举报详情' }); }

it('评论纯文字显示，审核绑定所见版本，驳回需要原因', async () => {
  const request = setup(); await openComment();
  expect(screen.getByText(/<script>保留为文字<\/script>/)).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '驳回评论' }));
  expect(screen.getByRole('alert')).toHaveTextContent('请填写驳回或隐藏原因');
  expect(request.mock.calls.filter(([, input]) => input?.method === 'POST')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('驳回或隐藏原因'), { target: { value: '请核对公开信息' } });
  fireEvent.click(screen.getByRole('button', { name: '驳回评论' }));
  await screen.findByText('评论已驳回。');
  expect(request).toHaveBeenCalledWith('/api/admin/comments/comment-1/actions', expect.objectContaining({ body: expect.objectContaining({ action: 'reject', expectedVersion: 3, reason: '请核对公开信息' }) }));
});
it('通过后从待审列表移除，公开列表可以查看并隐藏', async () => {
  const request = setup(); await openComment();
  fireEvent.click(screen.getByRole('button', { name: '通过评论' }));
  await screen.findByText('暂无这类评论。');
  fireEvent.click(screen.getByRole('tab', { name: '已通过' })); await openComment();
  expect(screen.queryByRole('button', { name: '通过评论' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('驳回或隐藏原因'), { target: { value: '核实后停止展示' } });
  fireEvent.click(screen.getByRole('button', { name: '隐藏评论' })); await screen.findByText('评论已隐藏，读者不再可见。');
  expect(request).toHaveBeenLastCalledWith('/api/admin/comments?state=approved');
});
it('未知审核结果仅重试相同操作 ID，不允许新审核或换筛选', async () => {
  const request = setup({ failure: 'lost' }); await openComment();
  fireEvent.click(screen.getByRole('button', { name: '通过评论' }));
  const retry = await screen.findByRole('button', { name: '重试原操作' });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(screen.getByRole('tab', { name: '已通过' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '通过评论' })).toBeDisabled();
  fireEvent.click(retry); await screen.findByText('评论已通过审核。');
  const writes = request.mock.calls.filter(([, input]) => input?.method === 'POST');
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
});
it('并发版本冲突关闭旧详情并刷新，不能自动复活已改变的评论', async () => {
  const request = setup({ failure: 'conflict' }); await openComment();
  fireEvent.click(screen.getByRole('button', { name: '通过评论' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('评论或举报状态已变化');
  expect(screen.queryByRole('article', { name: '评论详情' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重试原操作' })).not.toBeInTheDocument();
  expect(request.mock.calls.filter(([, input]) => input?.method === 'POST')).toHaveLength(1);
});
it('文章不可读或评论已删除时不提供通过操作', async () => {
  setup({ item: { ...comment, articleAvailable: false } }); await openComment();
  expect(screen.getByText('文章当前不可用，不能通过审核或恢复评论公开。')).toBeVisible();
  expect(screen.queryByRole('button', { name: '通过评论' })).not.toBeInTheDocument();
  cleanup(); setup({ item: { ...comment, state: 'deleted', text: '' } });
  fireEvent.click(await screen.findByRole('tab', { name: '已删除' }));
  fireEvent.click(await screen.findByRole('button', { name: /评论正文已清除/ }));
  await screen.findByRole('article', { name: '评论详情' });
  expect(screen.queryByRole('button', { name: '通过评论' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '隐藏评论' })).not.toBeInTheDocument();
});
it('举报隐藏与处理结论是两个显式操作，各自带版本', async () => {
  const request = setup({ mode: 'reports', item: { ...comment, state: 'approved' } }); await openReport();
  fireEvent.click(screen.getByRole('button', { name: '标记已处理' }));
  expect(screen.getByRole('alert')).toHaveTextContent('请填写举报处理结论');
  fireEvent.change(screen.getByLabelText('驳回或隐藏原因'), { target: { value: '存在不适宜信息' } });
  fireEvent.click(screen.getByRole('button', { name: '隐藏评论' }));
  await screen.findByText('评论已隐藏，读者不再可见。');
  expect(request.mock.calls.filter(([, input]) => input?.method === 'POST')).toHaveLength(1);
  await waitFor(() => expect(screen.getByRole('button', { name: '标记已处理' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('举报处理结论'), { target: { value: '已核实并隐藏评论' } });
  fireEvent.click(screen.getByRole('button', { name: '标记已处理' }));
  await screen.findByText('举报已处理，结论已记录。');
  expect(request).toHaveBeenCalledWith('/api/admin/comment-reports/report-1/resolve', expect.objectContaining({ body: expect.objectContaining({ expectedVersion: 2, reason: '已核实并隐藏评论' }) }));
  fireEvent.click(screen.getByRole('tab', { name: '已处理' })); await openReport();
  expect(screen.getByText('处理结论：已核实并隐藏评论')).toBeVisible();
  expect(screen.queryByRole('button', { name: '标记已处理' })).not.toBeInTheDocument();
});
it('举报不成立可以仅记录结论，未知响应沿用原处理请求', async () => {
  const request = setup({ mode: 'reports', failure: 'lost', item: { ...comment, state: 'approved' } }); await openReport();
  fireEvent.change(screen.getByLabelText('举报处理结论'), { target: { value: '未发现违规，保留展示' } });
  fireEvent.click(screen.getByRole('button', { name: '标记已处理' }));
  const retry = await screen.findByRole('button', { name: '重试原操作' }); await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry); await screen.findByText('举报已处理，结论已记录。');
  const writes = request.mock.calls.filter(([, input]) => input?.method === 'POST');
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]); expect(writes[0]![0]).toContain('/resolve');
});
it('分页保留前页，重复点击当前筛选不会清空列表', async () => {
  const request = setup({ pages: true }); await screen.findByRole('button', { name: /老街的故事/ });
  fireEvent.click(screen.getByRole('tab', { name: '待审核' }));
  expect(screen.getByRole('button', { name: /老街的故事/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  await screen.findByRole('button', { name: /第二页评论/ });
  expect(screen.getByRole('button', { name: /老街的故事/ })).toBeVisible();
  expect(request).toHaveBeenCalledWith('/api/admin/comments?state=pending&cursor=next%2Fcomment');
  expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
});
it('明确的后台权限拒绝不会被当作未知结果重复提交', async () => {
  setup({ failure: 'forbidden' }); await openComment(); fireEvent.click(screen.getByRole('button', { name: '通过评论' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('后台权限校验未通过');
  expect(screen.queryByRole('button', { name: '重试原操作' })).not.toBeInTheDocument();
});
it('后台评论入口复用管理员 cookie 和 CSRF，失效会话回到登录', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ url: path, init });
    if (path === '/api/admin/auth/session') return Response.json({ username: 'reviewer', csrfToken: 'csrf-review', expiresAt: '2026-09-09T20:00:00Z' });
    if (path === '/api/admin/topics') return Response.json({ topics: [], placements: [] });
    if (path === '/api/admin/topic-generations') return Response.json({ generations: [] });
    if (path === '/api/admin/audit' || path.endsWith('/audit')) return Response.json({ entries: [] });
    if (path === '/api/admin/monitoring') return Response.json({ error: '未配置' }, { status: 503 });
    if (path.endsWith('/actions')) return Response.json({ error: '登录已失效' }, { status: 401 });
    if (path === '/api/admin/comments/comment-1') return Response.json(comment);
    return Response.json({ comments: [comment], cursor: null });
  }));
  render(<TopicAdminApp />);
  const nav = await screen.findByRole('navigation', { name: '后台栏目' });
  fireEvent.click(within(nav).getByRole('button', { name: '评论审核' })); await openComment();
  fireEvent.click(screen.getByRole('button', { name: '通过评论' }));
  await screen.findByRole('button', { name: '登录' });
  const write = calls.find(call => call.url.endsWith('/actions'))!;
  expect(new Headers(write.init?.headers).get('X-CSRF-Token')).toBe('csrf-review');
  expect(write.init?.credentials).toBe('same-origin');
  expect(calls.some(call => call.url.startsWith('/api/mini'))).toBe(false);
});
it('运营汇总分开菜单意图和真实送达，不把事件次数解释为人数', async () => {
  const request = vi.fn(async () => ({ days: [
    { day: '2026-09-09', event: 'share_entry_open', action: 'read', count: 30 },
    { day: '2026-09-09', event: 'login_intent', action: 'gift', count: 12 },
    { day: '2026-09-09', event: 'login_success', action: 'gift', count: 8 },
    { day: '2026-09-09', event: 'interaction_confirmed', action: 'gift', count: 3 },
    { day: '2026-09-09', event: 'interaction_confirmed', action: 'like', count: 5 },
    { day: '2026-09-09', event: 'return_visit', action: 'read', count: 2 },
  ] }));
  render(<SocialMetricsPanel request={request as Request} />);
  const confirmed = await screen.findByLabelText('已确认互动分类');
  expect(within(confirmed).getByText('小花花送达').parentElement).toHaveTextContent('3');
  expect(screen.getByText('已确认互动').parentElement).toHaveTextContent('8');
  expect(screen.getByText('互动登录意图').parentElement).toHaveTextContent('12');
  expect(screen.getByText(/打开赠礼面板不计为送达/)).toHaveTextContent('不等同于人数');
});
it('运营汇总失败显示错误而不伪装为零，重试后展示真实空状态', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('互动汇总暂时无法读取')).mockResolvedValue({ days: [] });
  render(<SocialMetricsPanel request={request} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('互动汇总暂时无法读取');
  expect(screen.queryByText('已确认互动')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '刷新互动汇总' }));
  expect(await screen.findByText('这段时间还没有互动记录。')).toBeVisible();
});
