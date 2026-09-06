import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TopicAdminApp } from '../features/topic-admin/TopicAdminApp';
import type { WritingTopic } from '../packages/core/src/topics';

const baseTopic = (status: WritingTopic['status'] = 'candidate'): WritingTopic => ({
  id: 'community-meals', revision: 1, status, kind: 'current', title: '社区食堂多了，晚年生活也有了新的饭桌',
  summary: '越来越多社区尝试提供面向老年人的助餐服务，一顿饭也连接着生活便利、邻里交往和个人选择。',
  whyItMatters: '亲历者可以从一顿具体的饭写起，表达对便利、口味、尊严和邻里关系的真实判断。',
  updatedAt: '2026-09-04T08:00:00.000Z', publishedAt: status === 'published' ? '2026-09-04T08:00:00.000Z' : null,
  expiresAt: null, sources: [], angles: [{ id: 'angle-1', title: '一顿饭的变化', prompt: '社区食堂出现前后，吃饭这件事发生过什么变化' }],
  starterQuestion: '您第一次走进社区食堂时，最先注意到的是什么？', tags: ['社区生活'],
  reviewedBy: status === 'published' ? 'editor' : null, reviewedAt: status === 'published' ? '2026-09-04T08:00:00.000Z' : null,
});

const session = { authenticated: true, username: 'editor', csrfToken: 'csrf-for-ui-tests', expiresAt: '2026-09-04T20:00:00.000Z' };
const stored = (topic = baseTopic()) => ({ topic, editVersion: 3, editorBrief: '一顿社区食堂的饭' });
const json = (value: unknown, status = 200) => Response.json(value, { status });

afterEach(() => vi.unstubAllGlobals());

function dashboardFetch(options: { authenticatedInitially?: boolean; topic?: WritingTopic; costScenario?: 'normal' | 'limited' | 'unavailable' } = {}) {
  let loggedIn = options.authenticatedInitially ?? false;
  let current = stored(options.topic);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input); const method = init?.method ?? 'GET'; calls.push({ url, init });
    if (url === '/api/admin/auth/session' && method === 'GET') return loggedIn ? json(session) : json({ error: '后台会话无效或已过期。' }, 401);
    if (url === '/api/admin/auth/login') { loggedIn = true; return json(session); }
    if (url === '/api/admin/topics' && method === 'GET') return json({ topics: [current], placements: [] });
    if (url === '/api/admin/topic-generations' && method === 'GET') return json({ generations: [] });
    if (url === '/api/admin/audit') return json({ entries: [] });
    if (url === '/api/admin/monitoring') return json({
      capabilities: { aiConfigured: true, speechConfigured: true, topicsConfigured: true, topicAiConfigured: true, topicAdminConfigured: true,
        miniIdentityConfigured: false, costGovernanceConfigured: options.costScenario !== 'unavailable' },
      metrics: {
        startedAt: '2026-09-04T08:00:00.000Z', generatedAt: '2026-09-04T08:30:00.000Z', uptimeSeconds: 1800,
        lifetime: { requests: 12, successes: 11, clientErrors: 0, serverErrors: 1, inputTokens: 120, outputTokens: 40, averageDurationMs: 90, p95DurationMs: 250, errors: { upstream_network: 1 } },
        last15Minutes: { requests: 5, successes: 5, clientErrors: 0, serverErrors: 0, inputTokens: 20, outputTokens: 8, averageDurationMs: 42, p95DurationMs: 50, errors: {} },
        last60Minutes: { requests: 12, successes: 11, clientErrors: 0, serverErrors: 1, inputTokens: 120, outputTokens: 40, averageDurationMs: 90, p95DurationMs: 250, errors: { upstream_network: 1 } },
        actions: [{ action: 'event.app.opened', requests: 5, successes: 5, clientErrors: 0, serverErrors: 0, inputTokens: 0, outputTokens: 0,
          averageDurationMs: 3, p95DurationMs: 10, errors: {}, lastSeenAt: '2026-09-04T08:29:00.000Z' }],
      },
      costGovernance: options.costScenario === 'unavailable' ? null : options.costScenario === 'limited' ? {
        day: '2026-09-04', timezone: 'Asia/Shanghai', generatedAt: '2026-09-04T08:30:00.000Z', resetsAt: '2026-09-04T16:00:00.000Z',
        articleAi: { inputTokens: 0, outputTokens: 0, usedTokens: 0, reservedTokens: 0, limitTokens: 0, remainingTokens: 0, estimatedCny: null },
        topicAi: { inputTokens: 60, outputTokens: 20, usedTokens: 80, reservedTokens: 0, limitTokens: 100, remainingTokens: 20, estimatedCny: null },
        speech: { usedSeconds: 30, reservedSeconds: 0, limitSeconds: 30, remainingSeconds: 0, estimatedCny: null },
      } : {
        day: '2026-09-04', timezone: 'Asia/Shanghai', generatedAt: '2026-09-04T08:30:00.000Z', resetsAt: '2026-09-04T16:00:00.000Z',
        articleAi: { inputTokens: 12000, outputTokens: 3000, usedTokens: 15000, reservedTokens: 0, limitTokens: 1000000, remainingTokens: 985000, estimatedCny: 0.063 },
        topicAi: { inputTokens: 2100, outputTokens: 700, usedTokens: 2800, reservedTokens: 6000, limitTokens: 1100000, remainingTokens: 1091200, estimatedCny: null },
        speech: { usedSeconds: 95, reservedSeconds: 0, limitSeconds: 7200, remainingSeconds: 7105, estimatedCny: 0.084444 },
      },
    });
    if (url === `/api/admin/topics/${current.topic.id}/revisions` && method === 'GET') return json({ revisions: [current] });
    if (url === `/api/admin/topics/${current.topic.id}/revisions/1` && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)); current = { ...current, editVersion: 4, topic: { ...current.topic, ...body.content } }; return json(current);
    }
    throw new Error(`Unexpected admin request: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

it('logs in, loads the editorial shell and preserves optimistic editing plus source-free preview', async () => {
  const { calls } = dashboardFetch();
  render(<TopicAdminApp />);
  expect(await screen.findByRole('heading', { name: '话题编辑台' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'editor' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'local password' } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByRole('navigation', { name: '后台栏目' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /社区食堂多了/ }));
  expect(await screen.findByRole('dialog', { name: '话题详情' })).toBeInTheDocument();
  const preview = await screen.findByText('用户端预览');
  const previewPanel = preview.closest('aside')!;
  expect(within(previewPanel).queryByText('消息来源')).not.toBeInTheDocument();
  const title = screen.getByLabelText('标题');
  fireEvent.change(title, { target: { value: '社区食堂里的一顿饭，连接起新的邻里生活' } });
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByRole('status')).toHaveTextContent('编辑已保存');
  const patch = calls.find(call => call.init?.method === 'PATCH');
  expect(new Headers(patch?.init?.headers).get('If-Match')).toBe('3');
  expect(JSON.parse(String(patch?.init?.body)).content.title).toContain('新的邻里生活');
});

it('uses a dashboard, full topic table and closable detail drawer', async () => {
  dashboardFetch({ authenticatedInitially: true });
  render(<TopicAdminApp />);
  expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
  expect(screen.getAllByText('当前首页席位')).toHaveLength(2);
  const navigation = screen.getByRole('navigation', { name: '后台栏目' });
  fireEvent.click(within(navigation).getByRole('button', { name: '话题内容' }));
  const table = await screen.findByRole('table');
  expect(within(table).getByRole('columnheader', { name: '发布时间' })).toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button', { name: /社区食堂多了/ }));
  const drawer = await screen.findByRole('dialog', { name: '话题详情' });
  fireEvent.click(within(drawer).getByRole('tab', { name: '用户端预览' }));
  expect(within(drawer).getByText('大家也在关心')).toBeInTheDocument();
  expect(within(drawer).queryByText('消息来源')).not.toBeInTheDocument();
  fireEvent.click(within(drawer).getByRole('button', { name: '关闭话题详情' }));
  expect(screen.queryByRole('dialog', { name: '话题详情' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
  expect(screen.getAllByRole('button', { name: '关闭导航' })).toHaveLength(2);
});

it('keeps generation, scheduling and emergency takedown reachable in the compact console', async () => {
  dashboardFetch({ authenticatedInitially: true, topic: baseTopic('published') });
  render(<TopicAdminApp />);
  const navigation = await screen.findByRole('navigation', { name: '后台栏目' });
  fireEvent.click(within(navigation).getByRole('button', { name: '生成与新建' }));
  expect(screen.getByRole('button', { name: '生成一套候选' })).toBeDisabled();
  expect(screen.getByLabelText('允许 DeepSeek 联网搜索')).toBeChecked();
  fireEvent.click(within(navigation).getByRole('button', { name: '首页排期' }));
  expect(screen.getByRole('heading', { name: '首页五席时间表' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { name: /席位 [1-5]/ })).toHaveLength(5);
  fireEvent.click(within(navigation).getByRole('button', { name: '话题内容' }));
  fireEvent.click(await screen.findByRole('button', { name: /社区食堂多了/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: '紧急下线' })).toBeEnabled());
});

it('shows protected current-process metrics and capability status in the monitoring workspace', async () => {
  dashboardFetch({ authenticatedInitially: true });
  render(<TopicAdminApp />);
  const navigation = await screen.findByRole('navigation', { name: '后台栏目' });
  fireEvent.click(within(navigation).getByRole('button', { name: '运行监控' }));
  expect(await screen.findByRole('heading', { name: '运行监控' })).toBeInTheDocument();
  expect(await screen.findByText('5', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText('打开应用')).toBeInTheDocument();
  expect(screen.getByText('小程序身份').parentElement).toHaveTextContent('未配置');
  expect(screen.getByText('用量保护').parentElement).toHaveTextContent('已配置');
  expect(screen.getByRole('heading', { name: '今日付费用量' })).toBeInTheDocument();
  expect(screen.getByText('15,000')).toBeInTheDocument();
  expect(screen.getByText(/处理中预留 6,000/)).toBeInTheDocument();
  expect(screen.getByText('未配置费用估算')).toBeInTheDocument();
  expect(screen.getByText(/供应商控制台为账单依据/)).toBeInTheDocument();
  expect(screen.getByText(/跨服务重启保留/)).toBeInTheDocument();
});

it('labels disabled, near-limit, exhausted and unavailable cost protection states', async () => {
  dashboardFetch({ authenticatedInitially: true, costScenario: 'limited' });
  const first = render(<TopicAdminApp />);
  fireEvent.click(within(await screen.findByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '运行监控' }));
  expect(await screen.findByText('已停用')).toBeInTheDocument();
  expect(screen.getByText('接近上限')).toBeInTheDocument();
  expect(screen.getByText('已用完')).toBeInTheDocument();
  first.unmount();

  dashboardFetch({ authenticatedInitially: true, costScenario: 'unavailable' });
  render(<TopicAdminApp />);
  fireEvent.click(within(await screen.findByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '运行监控' }));
  expect(await screen.findByText('用量保护未配置')).toBeInTheDocument();
  expect(screen.getByText(/AI 与语音付费调用已关闭/)).toBeInTheDocument();
});
