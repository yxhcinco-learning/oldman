import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import type { TopicTransport } from '../features/topics/client';
import { IndexedWorkRepository } from '../lib/storage/repository';
import { REVIEWED_TOPIC_CATALOG } from '../server/topic-catalog';
import type { WritingTopic } from '../lib/domain/topics';

const repositories: IndexedWorkRepository[] = [];
const repository = () => { const value = new IndexedWorkRepository(crypto.randomUUID()); repositories.push(value); return value; };
afterEach(async () => { for (const value of repositories.splice(0)) await value.close(); });

const transport = (topics: WritingTopic[], detail = topics[0]): TopicTransport => ({
  list: vi.fn(async () => topics),
  detail: vi.fn(async () => detail),
});

it('shows no more than five reviewed topics with their sources and suggested angles', async () => {
  const topics = REVIEWED_TOPIC_CATALOG.slice(0, 6);
  render(<ProductApp repository={repository()} topicTransport={transport(topics)} />);
  expect(await screen.findByRole('heading', { name: '今日值得写' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole('button', { name: /看看背景与角度/ })).toHaveLength(5));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(topics[0].title) }));
  const dialog = screen.getByRole('dialog', { name: topics[0].title });
  expect(within(dialog).getAllByText(topics[0].angles[0].prompt)).toHaveLength(2);
  const source = within(dialog).getByRole('link');
  expect(source).toHaveAttribute('href', topics[0].sources[0].url);
  expect(source).toHaveAttribute('target', '_blank');
});

it('starts normal writing with a saved background snapshot and never inserts it into the body', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic])} />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '直接写' }));
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
  expect(await screen.findByText('议题暂时没有取到，你仍可继续写作和打开作品。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /开始写作/ })).toBeEnabled();
  expect(screen.getByRole('heading', { name: '我的作品' })).toBeInTheDocument();
  view.unmount();
  render(<ProductApp repository={repository()} topicTransport={transport([])} />);
  expect(await screen.findByText('今天还没有新议题，先从自己的近况写起吧。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /开始写作/ })).toBeEnabled();
});

it('shows a newer topic revision but only replaces the saved background after explicit confirmation', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const latest: WritingTopic = { ...topic, revision: 2, status: 'corrected', summary: `${topic.summary} 本议题已补充新的背景说明。`, updatedAt: '2026-08-31T09:00:00.000Z', correctionNote: '补充了背景说明，原有来源不变。' };
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic], latest)} />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '直接写' }));
  const update = await screen.findByRole('button', { name: '议题有更新，查看差异' });
  fireEvent.click(update);
  const dialog = screen.getByRole('dialog', { name: '议题背景有更新' });
  expect(within(dialog).getByText(topic.summary)).toBeInTheDocument();
  expect(within(dialog).getByText(latest.summary)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '保留原背景' }));
  expect((await store.load()).recovery?.draft.topicSnapshot?.revision).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '议题有更新，查看差异' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '议题背景有更新' })).getByRole('button', { name: '采用新版背景' }));
  await waitFor(async () => expect((await store.load()).recovery?.draft.topicSnapshot?.revision).toBe(2));
  expect(screen.queryByRole('button', { name: '议题有更新，查看差异' })).not.toBeInTheDocument();
});

it('opens XiaoWen as the interview mode for the same topic instead of a separate chat product', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic])} />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '让小文问问我' }));
  expect(await screen.findByRole('dialog', { name: '小文' })).toBeInTheDocument();
  await waitFor(async () => {
    const saved = (await store.load()).recovery?.draft;
    expect(saved?.topicSnapshot?.id).toBe(topic.id);
    expect(saved?.topicWritingMode).toBe('interview');
  });
});
