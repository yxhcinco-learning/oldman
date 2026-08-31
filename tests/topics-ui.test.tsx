import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import { selectHomeTopics, type TopicTransport } from '../features/topics/client';
import { topicAngleCopy } from '../features/topics/copy';
import { IndexedWorkRepository } from '../lib/storage/repository';
import { REVIEWED_TOPIC_CATALOG } from '../server/topic-catalog';
import type { WritingTopic } from '../lib/domain/topics';
import type { AiTransport } from '../features/ai/session';

const repositories: IndexedWorkRepository[] = [];
const repository = () => { const value = new IndexedWorkRepository(crypto.randomUUID()); repositories.push(value); return value; };
afterEach(async () => { localStorage.clear(); for (const value of repositories.splice(0)) await value.close(); });

const transport = (topics: WritingTopic[], detail = topics[0]): TopicTransport => ({
  list: vi.fn(async () => topics),
  detail: vi.fn(async () => detail),
});
const openTopics = async () => { fireEvent.click(await screen.findByRole('tab', { name: '热门' })); };

it('keeps the five-card home selection mixed across current, periodic and slow topics', () => {
  const selected = selectHomeTopics(REVIEWED_TOPIC_CATALOG, 5);
  expect(selected).toHaveLength(5);
  expect(new Set(selected.map(topic => topic.kind))).toEqual(new Set(['current', 'periodic', 'slow']));
  expect(selected.filter(topic => topic.kind === 'current')).toHaveLength(2);
});

it('keeps every published title and visible facet free of assignment-style copy', () => {
  for (const topic of REVIEWED_TOPIC_CATALOG) {
    expect(topic.title).not.toMatch(/您|^(写|谈|回忆|讨论|列出|解释)/);
    for (const angle of topic.angles) expect(topicAngleCopy(angle.prompt)).not.toMatch(/^(写|谈|回忆|讨论|列出|解释|给)/);
  }
});

it('separates popular topics from articles and presents them as content instead of writing assignments', async () => {
  const topics = REVIEWED_TOPIC_CATALOG.slice(0, 6);
  render(<ProductApp repository={repository()} topicTransport={transport(topics)} />);
  expect(await screen.findByRole('heading', { name: '我的作品' })).toBeInTheDocument();
  expect(screen.queryByText(topics[0].title)).not.toBeInTheDocument();
  await openTopics();
  await waitFor(() => expect(screen.getAllByRole('button', { name: /了解详情/ })).toHaveLength(5));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(topics[0].title) }));
  const dialog = screen.getByRole('dialog', { name: topics[0].title });
  expect(within(dialog).queryByText('为什么值得写')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('可以从这里想起')).not.toBeInTheDocument();
  expect(within(dialog).getByText(topics[0].angles[0].prompt.replace(/^回忆/, ''))).toBeInTheDocument();
  const source = within(dialog).getByRole('link');
  expect(source).toHaveAttribute('href', topics[0].sources[0].url);
  expect(source).toHaveAttribute('target', '_blank');
});

it('starts normal writing with a saved background snapshot and never inserts it into the body', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic])} />);
  await openTopics();
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '自己写' }));
  await screen.findByRole('group', { name: '文章正文' });
  fireEvent.click(screen.getByRole('button', { name: '切换到文字输入' }));
  const body = screen.getByLabelText<HTMLTextAreaElement>('文章正文');
  expect(body).toHaveValue('');
  expect(screen.getByRole('button', { name: new RegExp(`文章背景.*${topic.title}`) })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`文章背景.*${topic.title}`) }));
  expect(screen.getByText(topic.summary)).toBeInTheDocument();
  expect(body).toHaveValue('');
  await waitFor(async () => {
    const saved = (await store.load()).recovery?.draft;
    expect(saved?.topicSnapshot?.id).toBe(topic.id);
    expect(saved?.topicWritingMode).toBe('normal');
    expect(saved?.textDraft).toBe('');
  });
});

it('keeps works and plain writing available when topics fail or the reviewed list is empty', async () => {
  const failing: TopicTransport = { list: vi.fn(async () => { throw new Error('offline'); }), detail: vi.fn(async () => { throw new Error('offline'); }) };
  const view = render(<ProductApp repository={repository()} topicTransport={failing} />);
  await openTopics();
  expect(await screen.findByText('热门话题暂时没有加载出来。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /开始写作/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '文章' }));
  expect(screen.getByRole('heading', { name: '我的作品' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /开始写作/ })).toBeEnabled();
  view.unmount();
  render(<ProductApp repository={repository()} topicTransport={transport([])} />);
  await openTopics();
  expect(await screen.findByText('暂时没有新内容。')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '文章' })).toBeEnabled();
});

it('shows a newer topic revision but only replaces the saved background after explicit confirmation', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const latest: WritingTopic = { ...topic, revision: 2, status: 'corrected', summary: `${topic.summary} 本议题已补充新的背景说明。`, updatedAt: '2026-08-31T09:00:00.000Z', correctionNote: '补充了背景说明，原有来源不变。' };
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic], latest)} />);
  await openTopics();
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '自己写' }));
  const update = await screen.findByRole('button', { name: '话题内容有更新' });
  fireEvent.click(update);
  const dialog = screen.getByRole('dialog', { name: '话题内容有更新' });
  expect(within(dialog).getByText(topic.summary)).toBeInTheDocument();
  expect(within(dialog).getByText(latest.summary)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '保留原内容' }));
  expect((await store.load()).recovery?.draft.topicSnapshot?.revision).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '话题内容有更新' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '话题内容有更新' })).getByRole('button', { name: '使用新内容' }));
  await waitFor(async () => expect((await store.load()).recovery?.draft.topicSnapshot?.revision).toBe(2));
  expect(screen.queryByRole('button', { name: '话题内容有更新' })).not.toBeInTheDocument();
});

it('uses XiaoWen to save answers as materials, ask one next question and compose only through an explicit candidate', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  const ai = vi.fn<AiTransport>(async request => ({ requestId: request.requestId, result: request.action === 'interview'
    ? { answer: '那次尝试中，最难解决的一步是什么？', citedVersionIds: [] }
    : { answer: '采用了您关于第一次接触电脑的回答。', body: '九十年代，我第一次尝试用电脑备课，是从练习打字开始的。', citedVersionIds: [] } }));
  render(<ProductApp repository={store} topicTransport={transport([topic])} aiTransport={ai} />);
  await openTopics();
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '和小文聊聊' }));
  expect(await screen.findByRole('dialog', { name: '小文' })).toBeInTheDocument();
  expect(screen.getByRole('log', { name: '小文采访对话' })).toHaveTextContent(topic.starterQuestion);
  expect(screen.getByRole('button', { name: '点按开始语音输入回复' })).toBeInTheDocument();
  const answer = screen.getByLabelText('回复小文');
  fireEvent.change(answer, { target: { value: '九十年代，我第一次尝试用电脑备课，是从练习打字开始的。' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await waitFor(async () => {
    const saved = (await store.load()).recovery?.draft;
    expect(saved?.topicSnapshot?.id).toBe(topic.id);
    expect(saved?.topicWritingMode).toBe('interview');
    expect(saved?.materials).toHaveLength(1);
    expect(saved?.materials[0]).toMatchObject({ source: 'interview-answer', selected: true, question: topic.starterQuestion });
    expect(saved?.textDraft).toBe('');
  });
  expect(await screen.findByText('那次尝试中，最难解决的一步是什么？')).toBeInTheDocument();
  expect(ai.mock.calls[0][0]).toMatchObject({ action: 'interview', current: { body: '' }, materials: [{ source: 'interview-answer' }] });
  const compose = screen.getByRole('button', { name: '整理成文章' });
  await waitFor(() => expect(compose).toBeEnabled());
  fireEvent.click(compose);
  expect(await screen.findByRole('region', { name: '整理后全文' })).toHaveTextContent('九十年代，我第一次尝试用电脑备课');
  expect((await store.load()).recovery?.draft.textDraft).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '采用这篇文章' }));
  await waitFor(async () => expect((await store.load()).recovery?.draft.textDraft).toContain('九十年代'));
});

it('closes as a pause and later resumes the same XiaoWen interview without duplicate exit buttons', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic])} />);
  await openTopics();
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '和小文聊聊' }));
  expect(screen.queryByRole('button', { name: '先暂停' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '回到文章' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: '收起小文' }));
  expect(screen.queryByRole('dialog', { name: '小文' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '打开小文' }));
  expect(await screen.findByRole('log', { name: '小文采访对话' })).toHaveTextContent(topic.starterQuestion);
  expect((await store.load()).recovery?.draft.topicWritingMode).toBe('interview');
});

it('preserves an unsaved interview answer when the next-question request fails', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const ai = vi.fn<AiTransport>(async () => { throw new Error('采访服务暂时不可用。'); });
  render(<ProductApp repository={repository()} topicTransport={transport([topic])} aiTransport={ai} />);
  await openTopics();
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '和小文聊聊' }));
  const answer = await screen.findByLabelText('回复小文');
  fireEvent.change(answer, { target: { value: '这段话还没有保存，请不要丢掉。' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('采访服务暂时不可用');
  expect(screen.getByRole('log', { name: '小文采访对话' })).toHaveTextContent('这段话还没有保存，请不要丢掉。');
  expect(await screen.findByRole('button', { name: '再试一次' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '文章正文' })).not.toHaveTextContent('这段话还没有保存');
});
