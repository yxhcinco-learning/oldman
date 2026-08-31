import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import { selectHomeTopics, type TopicTransport } from '../features/topics/client';
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

it('keeps the five-card home selection mixed across current, periodic and slow topics', () => {
  const selected = selectHomeTopics(REVIEWED_TOPIC_CATALOG, 5);
  expect(selected).toHaveLength(5);
  expect(new Set(selected.map(topic => topic.kind))).toEqual(new Set(['current', 'periodic', 'slow']));
  expect(selected.filter(topic => topic.kind === 'current')).toHaveLength(2);
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

it('uses XiaoWen to save answers as materials, ask one next question and compose only through an explicit candidate', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  const ai = vi.fn<AiTransport>(async request => ({ requestId: request.requestId, result: request.action === 'interview'
    ? { answer: '那次尝试中，最难解决的一步是什么？', citedVersionIds: [] }
    : { answer: '采用了您关于第一次接触电脑的回答。', body: '九十年代，我第一次尝试用电脑备课，是从练习打字开始的。', citedVersionIds: [] } }));
  render(<ProductApp repository={store} topicTransport={transport([topic])} aiTransport={ai} />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '让小文问问我' }));
  expect(await screen.findByRole('dialog', { name: '小文' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '当前采访问题' })).toHaveTextContent(topic.starterQuestion);
  expect(screen.getByRole('button', { name: '点按开始语音输入回答' })).toBeInTheDocument();
  const answer = screen.getByLabelText('您的回答');
  fireEvent.change(answer, { target: { value: '九十年代，我第一次尝试用电脑备课，是从练习打字开始的。' } });
  fireEvent.click(screen.getByRole('button', { name: '保存回答' }));
  await waitFor(async () => {
    const saved = (await store.load()).recovery?.draft;
    expect(saved?.topicSnapshot?.id).toBe(topic.id);
    expect(saved?.topicWritingMode).toBe('interview');
    expect(saved?.materials).toHaveLength(1);
    expect(saved?.materials[0]).toMatchObject({ source: 'interview-answer', selected: true, question: topic.starterQuestion });
    expect(saved?.textDraft).toBe('');
  });
  expect(screen.getByRole('checkbox', { name: /回答 1/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '继续问我' }));
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

it('pauses and later resumes the same XiaoWen interview, while return-to-writing exits the mode', async () => {
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const store = repository();
  render(<ProductApp repository={store} topicTransport={transport([topic])} />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '让小文问问我' }));
  fireEvent.click(await screen.findByRole('button', { name: '先暂停' }));
  expect(screen.queryByRole('dialog', { name: '小文' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '打开小文' }));
  expect(await screen.findByRole('region', { name: '当前采访问题' })).toHaveTextContent(topic.starterQuestion);
  fireEvent.click(screen.getByRole('button', { name: '回到文章' }));
  expect(screen.queryByRole('dialog', { name: '小文' })).not.toBeInTheDocument();
  await waitFor(async () => expect((await store.load()).recovery?.draft.topicWritingMode).toBe('normal'));
  fireEvent.click(screen.getByRole('button', { name: '打开小文' }));
  expect(await screen.findByLabelText('问问小文')).toBeInTheDocument();
  expect(screen.queryByLabelText('小文采访')).not.toBeInTheDocument();
});

it('preserves an unsaved interview answer when the next-question request fails', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const topic = REVIEWED_TOPIC_CATALOG[0];
  const ai = vi.fn<AiTransport>(async () => { throw new Error('采访服务暂时不可用。'); });
  render(<ProductApp repository={repository()} topicTransport={transport([topic])} aiTransport={ai} />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(topic.title) }));
  fireEvent.click(screen.getByRole('button', { name: '让小文问问我' }));
  const answer = await screen.findByLabelText('您的回答');
  fireEvent.change(answer, { target: { value: '这段话还没有保存，请不要丢掉。' } });
  fireEvent.click(screen.getByRole('button', { name: '继续问我' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('采访服务暂时不可用');
  expect(screen.getByLabelText('您的回答')).toHaveValue('这段话还没有保存，请不要丢掉。');
  expect(screen.getByRole('group', { name: '文章正文' })).not.toHaveTextContent('这段话还没有保存');
});
