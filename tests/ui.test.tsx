import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import { IndexedWorkRepository } from '../lib/storage/repository';
import { makeBackup } from '../lib/storage/backup';
import type { AiRequest } from '../features/ai/protocol';

const repos: IndexedWorkRepository[] = [];
const repo = () => { const r = new IndexedWorkRepository(crypto.randomUUID()); repos.push(r); return r; };
afterEach(async () => { localStorage.clear(); vi.useRealTimers(); for (const r of repos.splice(0)) await r.close(); });
async function startWriting() {
  fireEvent.click(await screen.findByRole('button', { name: /开始写作/ }));
  fireEvent.change(await screen.findByLabelText('文章标题'), { target: { value: '夏日有感' } });
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  fireEvent.change(screen.getByLabelText('文章正文'), { target: { value: '窗前的雨\n落进了风里\n\n我想把这一刻写下来。' } });
  await screen.findByText('已保存到本机');
}
it('starts with an empty local library and never inserts preview examples', async () => {
  const repository = repo(); const { container } = render(<ProductApp repository={repository} />);
  await screen.findByRole('heading', { name: '我的作品' });
  expect(screen.getByText('0 篇作品')).toBeVisible();
  expect(screen.getByText('写下的内容会保存在这台设备上')).toBeVisible();
  expect(container.querySelector('.work-card')).toBeNull();
  expect((await repository.load()).works).toHaveLength(0);
});
it('writes, edits the body on the current page, saves, reopens and restores from IndexedDB', async () => {
  const repository = repo(); const view = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  fireEvent.change(screen.getByRole('textbox', { name: '文章正文' }), { target: { value: '我修改了这一段。\n\n我想把这一刻写下来。' } });
  fireEvent.click(await screen.findByRole('button', { name: '保存' }));
  await screen.findByRole('heading', { name: '我的作品' }); expect((await repository.load()).works[0].segments[0].text).toBe('我修改了这一段。');
  view.unmount(); render(<ProductApp repository={repository} />); fireEvent.click(await screen.findByRole('button', { name: /夏日有感.*继续写/ }));
  expect(await screen.findByRole('textbox', { name: '文章正文' })).toHaveValue('我修改了这一段。\n\n我想把这一刻写下来。');
});
it('previews a real optimization before applying and persists an undo as history', async () => {
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId, result: { answer: '调整标点。', body: '窗前的雨，\n落进了风里。\n\n我想把这一刻写下来。', citedVersionIds: [] } }));
  const repository = repo(); render(<ProductApp repository={repository} aiTransport={transport} />); await startWriting();
  const before = (await repository.load()).works[0]; fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  expect(screen.queryByText('演示模式 · 不影响作品')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^常规优化/ })); expect(transport).not.toHaveBeenCalled();
  expect(screen.getByText(/相关修改记录和聊天消息会经本地服务发送给 DeepSeek/)).toBeInTheDocument();
  expect(screen.getByText(/AI 可能出错，请核对人物、时间与细节/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '同意并继续' }));
  expect(await screen.findByRole('heading', { name: '和小文聊一聊' })).toBeInTheDocument();
  expect(await screen.findByText('调整标点。')).toBeInTheDocument();
  expect(screen.getByText('常规优化')).toBeInTheDocument();
  expect(screen.getByText('小文的修改说明')).toBeInTheDocument();
  const pendingState = screen.getByText('待应用');
  expect(pendingState).toBeInTheDocument(); expect(pendingState.closest('.message-bubble')).toBeNull();
  expect(screen.queryByRole('region', { name: '优化后全文' })).not.toBeInTheDocument();
  expect((await repository.load()).works[0].draft.textDraft).toBe(before.draft.textDraft);
  fireEvent.click(screen.getByRole('button', { name: '查看优化结果' }));
  expect(await screen.findByRole('region', { name: '优化后全文' })).toHaveTextContent('窗前的雨，');
  fireEvent.click(screen.getByRole('button', { name: '对照原文' })); expect(screen.getByRole('region', { name: '优化前原文' })).toHaveTextContent('窗前的雨');
  fireEvent.click(screen.getByRole('button', { name: '应用优化' }));
  const appliedNotice = await screen.findByText('已应用优化并保存到本机。');
  expect(appliedNotice).toHaveClass('ai-assistant-toast');
  expect(screen.getByText('调整标点。')).toBeInTheDocument();
  expect(screen.getByText('已应用')).toBeInTheDocument();
  expect((await repository.load()).works[0].draft.textDraft).toContain('窗前的雨，');
  const resultAction = screen.getByRole('button', { name: '查看优化结果' });
  const undoAction = screen.getByRole('button', { name: '撤销这次优化' });
  expect(resultAction).toHaveClass('ai-turn-primary');
  expect(undoAction).toHaveClass('ai-turn-undo');
  expect(resultAction.parentElement).toBe(undoAction.parentElement);
  await waitFor(() => expect(screen.queryByText('已应用优化并保存到本机。')).not.toBeInTheDocument(), { timeout: 4000 });
  fireEvent.click(undoAction); await screen.findByText('已恢复并保存，其他修改记录仍保留。');
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue(before.draft.textDraft);
  expect((await repository.load()).sessions[0].versions.at(-1)?.source).toBe('restore');
});
it('answers in the article conversation and exposes an actual cited version without modifying the body', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId, result: { answer: '原文仍在这个版本中。', citedVersionIds: [request.current.id] } }));
  const repository = repo(); const view = render(<ProductApp repository={repository} aiTransport={transport} />); await startWriting(); const before = (await repository.load()).works[0];
  fireEvent.click(screen.getByRole('button', { name: '聊天引导' })); fireEvent.change(screen.getByLabelText('问问小文'), { target: { value: '我原来写的内容呢？' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' })); await screen.findByText('原文仍在这个版本中。');
  expect(transport.mock.calls[0][0].action).toBe('chat');
  fireEvent.click(screen.getByRole('button', { name: '查看引用记录 1' })); expect(screen.getByRole('region', { name: '修改记录正文' })).toHaveTextContent('窗前的雨');
  expect((await repository.load()).works[0].draft.textDraft).toEqual(before.draft.textDraft);
  view.unmount(); render(<ProductApp repository={repository} aiTransport={transport} />);
  fireEvent.click(await screen.findByRole('button', { name: '聊天引导' })); expect(await screen.findByText('原文仍在这个版本中。')).toBeInTheDocument();
  expect(transport).toHaveBeenCalledOnce();
});
it('turns an explicit conversational request into a preview and applies it only after confirmation', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId, result: request.prompt.startsWith('只把第一段')
    ? { answer: '只让第一段更温暖。', body: request.current.body.replace('窗前的雨', '窗前温柔的雨'), citedVersionIds: [] }
    : { answer: '这是只读回答。', citedVersionIds: [request.current.id] } }));
  const repository = repo(); render(<ProductApp repository={repository} aiTransport={transport} />); await startWriting();
  const before = (await repository.load()).works[0].draft.textDraft;
  fireEvent.click(screen.getByRole('button', { name: '聊天引导' }));
  fireEvent.change(screen.getByLabelText('问问小文'), { target: { value: '只把第一段写得更温暖，其他不变' } });
  expect(screen.getByRole('button', { name: '发送' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /问小文|调整文章/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  expect(await screen.findByText('只让第一段更温暖。')).toBeInTheDocument();
  expect(screen.getByText('小文的修改说明')).toBeInTheDocument();
  expect(screen.getByText('待应用')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '调整后全文' })).not.toBeInTheDocument();
  expect((await repository.load()).works[0].draft.textDraft).toBe(before);
  expect(transport.mock.calls[0][0]).toMatchObject({ action: 'chat', prompt: '只把第一段写得更温暖，其他不变' });
  fireEvent.click(screen.getByRole('button', { name: '查看调整结果' }));
  expect(await screen.findByRole('region', { name: '调整后全文' })).toHaveTextContent('窗前温柔的雨');
  expect(screen.getByText('请核对人物、动作和经历。')).toBeInTheDocument();
  expect(screen.queryByText(/文风调整会改变表达/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '返回上一级' }));
  expect(screen.getByRole('heading', { name: '和小文聊一聊' })).toBeInTheDocument();
  expect(screen.getByText('只让第一段更温暖。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看调整结果' }));
  fireEvent.click(screen.getByRole('button', { name: '应用调整' })); await screen.findByText('已应用调整并保存到本机。');
  expect((await repository.load()).works[0].draft.textDraft).toContain('窗前温柔的雨');
  expect((await repository.load()).sessions[0].versions.at(-1)?.source).toBe('rewrite');
  fireEvent.change(screen.getByLabelText('问问小文'), { target: { value: '刚才改了哪里？' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' })); await screen.findByText('这是只读回答。');
  expect(transport.mock.calls[1][0].action).toBe('chat');
});
it('keeps the modification explanation when a candidate is not adopted', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId,
    result: { answer: '调整了第一段的语序和节奏。', body: request.current.body.replace('窗前的雨', '雨落窗前'), citedVersionIds: [] } }));
  const repository = repo(); render(<ProductApp repository={repository} aiTransport={transport} />); await startWriting();
  const before = (await repository.load()).works[0].draft.textDraft;
  fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  fireEvent.click(screen.getByRole('button', { name: '进入小文会话并输入需求' }));
  fireEvent.change(screen.getByLabelText('问问小文'), { target: { value: '调整第一段语序' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  expect(await screen.findByText('调整了第一段的语序和节奏。')).toBeInTheDocument();
  expect(screen.getByText('待应用')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看调整结果' }));
  const dismiss = screen.getByRole('button', { name: '先不修改' });
  await waitFor(() => expect(dismiss).toBeEnabled()); fireEvent.click(dismiss);
  await screen.findByText('未采用，正文未变。');
  expect(await screen.findByText('调整了第一段的语序和节奏。')).toBeInTheDocument();
  expect(screen.getByText('未采用')).toBeInTheDocument();
  expect((await repository.load()).works[0].draft.textDraft).toBe(before);
});
it('shows unchanged output as having no body change outside the assistant bubble', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId,
    result: { answer: '没有需要修改的内容。', body: request.current.body, citedVersionIds: [] } }));
  render(<ProductApp repository={repo()} aiTransport={transport} />); await startWriting();
  fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  fireEvent.click(screen.getByRole('button', { name: /^常规优化/ }));
  expect(await screen.findByText('本次保留原文，未产生正文修改。')).toBeInTheDocument();
  const unchanged = screen.getByText('无正文变化');
  expect(unchanged.closest('.message-bubble')).toBeNull();
  expect(screen.queryByText('待应用')).not.toBeInTheDocument();
});
it('runs polish from its shortcut inside the conversation', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId,
    result: { answer: '改善了句式衔接。', body: `${request.current.body}\n`, citedVersionIds: [] } }));
  render(<ProductApp repository={repo()} aiTransport={transport} />); await startWriting();
  fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  fireEvent.click(screen.getByRole('button', { name: /^润色文笔/ }));
  expect(await screen.findByRole('heading', { name: '和小文聊一聊' })).toBeInTheDocument();
  expect(await screen.findByText('改善了句式衔接。')).toBeInTheDocument();
  expect(screen.getByText('润色文笔')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看优化结果' })).toBeInTheDocument();
  expect(transport.mock.calls[0][0]).toMatchObject({ action: 'polish', prompt: '' });
});
it('recovers unfinished current-page body editing after remount', async () => {
  const repository = repo(); const view = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.change(screen.getByRole('textbox', { name: '文章正文' }), { target: { value: '还没保存的当前页修改' } });
  await waitFor(async () => expect((await repository.load()).recovery?.draft.textDraft).toBe('还没保存的当前页修改'));
  view.unmount(); render(<ProductApp repository={repository} />);
  expect(await screen.findByRole('textbox', { name: '文章正文' })).toHaveValue('还没保存的当前页修改');
});
it('copies real body and restores a work from the recycle bin', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  fireEvent.click(await screen.findByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '我的作品' });
  const chooseWork = (section: string) => {
    fireEvent.click(screen.getByRole('button', { name: '作品与备份选项' }));
    fireEvent.click(screen.getByRole('button', { name: section }));
    fireEvent.click(screen.getByRole('button', { name: '选择作品：夏日有感' }));
  };
  chooseWork('管理作品'); fireEvent.click(screen.getByRole('button', { name: '复制正文' }));
  expect(writeText).toHaveBeenCalledWith('窗前的雨\n落进了风里\n\n我想把这一刻写下来。');
  chooseWork('管理作品'); fireEvent.click(screen.getByRole('button', { name: '移入回收站' })); await screen.findByText('已移入回收站，可以随时恢复');
  expect(screen.queryByRole('button', { name: /夏日有感.*继续写/ })).not.toBeInTheDocument();
  chooseWork('回收站'); fireEvent.click(screen.getByRole('button', { name: '恢复作品' })); await screen.findByText('作品已恢复');
  expect((await repository.load()).works[0].deletedAt).toBeNull();
  expect(screen.getByRole('button', { name: /夏日有感.*继续写/ })).toBeInTheDocument();
});

it('keeps only the approved home affordances and card hierarchy', async () => {
  const repository = repo(); const { container } = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(await screen.findByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '我的作品' });
  const recent = screen.getByRole('region', { name: '最近写下' });
  const card = within(recent).getByRole('button', { name: /夏日有感.*继续写/ });
  expect(within(recent).getAllByRole('button')).toEqual([card]);
  expect(card.parentElement).toHaveClass('work-list');
  expect(card.querySelector('.work-bottom small')).toHaveTextContent('已保存');
  expect(card.querySelector('time')).toHaveTextContent('刚刚');
  expect(card.querySelector('.work-bottom i')).toHaveTextContent('继续写');
  expect(container.querySelector('.work-menu, .work-row, .library-links')).toBeNull();
  expect(screen.queryByRole('button', { name: '回收站' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /体验 AI 演示/ })).not.toBeInTheDocument();
  expect(screen.getByText('不必想好开头，从想说的开始。', { exact: false })).toBeInTheDocument();
});

it('keeps writing tools directly below the editor without an added save row', async () => {
  const { container } = render(<ProductApp repository={repo()} />); await startWriting();
  expect(container.querySelector('.save-row')).toBeNull();
  expect(container.querySelector('.editor-scroll')?.nextElementSibling).toHaveClass('editor-dock');
  expect(screen.queryByRole('button', { name: '导出与更多操作' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('文章正文')).toHaveAttribute('placeholder', '从想说的一句话开始……');
  expect(screen.getByRole('button', { name: '保存' })).toHaveAccessibleDescription('已保存到本机');
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  expect(screen.getByRole('textbox', { name: '文章正文' })).toHaveFocus();
  expect(container.querySelector('.segment-editor-wrap')).toBeNull();
  expect(screen.queryByText('修改会自动保存在本机')).not.toBeInTheDocument();
});

it('keeps backups in the original more menu and navigates its subpanels without adding home links', async () => {
  render(<ProductApp repository={repo()} />);
  const moreButton = await screen.findByRole('button', { name: '作品与备份选项' });
  moreButton.focus(); fireEvent.click(moreButton);
  expect(screen.getByRole('button', { name: '导出全部备份' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '从备份恢复副本' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '回收站' }));
  expect(screen.getByRole('dialog', { name: '回收站' })).toBeInTheDocument();
  expect(screen.getByText('回收站是空的')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '返回上一级' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '返回上一级' }));
  expect(screen.getByRole('dialog', { name: '作品与备份' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '回收站' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '作品与备份选项' })).toHaveFocus();
});

it('restores a backup from the original more menu without overwriting the existing work', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(await screen.findByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '我的作品' });
  const original = (await repository.load()).works[0];
  const raw = makeBackup([original]);
  fireEvent.click(screen.getByRole('button', { name: '作品与备份选项' }));
  const input = screen.getByLabelText('选择备份文件');
  expect(input).toHaveAttribute('hidden');
  const chooseFile = vi.spyOn(input, 'click');
  fireEvent.click(screen.getByRole('button', { name: '从备份恢复副本' })); expect(chooseFile).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { files: [{ size: raw.length, text: async () => raw }] } });
  await screen.findByText('已恢复 1 篇副本，原作品未改变');
  const restored = (await repository.load()).works;
  expect(restored).toHaveLength(2);
  expect(restored.find(w => w.id === original.id)).toEqual(original);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '选择备份文件' })).not.toBeInTheDocument();
});

it('shows invalid backup feedback outside the modal and preserves existing data', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(await screen.findByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '我的作品' });
  const original = (await repository.load()).works;
  fireEvent.click(screen.getByRole('button', { name: '作品与备份选项' }));
  fireEvent.change(screen.getByLabelText('选择备份文件'), { target: { files: [{ size: 4, text: async () => 'oops' }] } });
  expect(await screen.findByText('这不是有效的 JSON 备份，原作品未改变')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect((await repository.load()).works).toEqual(original);
});

it('does not hide a failed work-management operation behind the modal', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(await screen.findByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '我的作品' });
  vi.spyOn(repository, 'setDeleted').mockRejectedValueOnce(new Error('本机操作失败，请先备份'));
  fireEvent.click(screen.getByRole('button', { name: '作品与备份选项' }));
  fireEvent.click(screen.getByRole('button', { name: '管理作品' }));
  fireEvent.click(screen.getByRole('button', { name: '选择作品：夏日有感' }));
  fireEvent.click(screen.getByRole('button', { name: '移入回收站' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('本机操作失败，请先备份');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: /夏日有感.*继续写/ })).toBeInTheDocument();
  expect((await repository.load()).works[0].deletedAt).toBeNull();
});
it('shows the new categories and returns an optimization conversation to its menu before closing', async () => {
  const transport = vi.fn(); render(<ProductApp repository={repo()} aiTransport={transport} />); await startWriting();
  const opener = screen.getByRole('button', { name: '文章优化' }); opener.focus(); fireEvent.click(opener);
  expect(screen.getByRole('button', { name: /^润色文笔/ })).toBeEnabled();
  for (const name of ['精简内容', '扩写内容', '添加配图']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /内容类型|文风调整|格式整理/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '进入小文会话并输入需求' })).toHaveTextContent('问小文，或提出修改要求');
  expect(screen.queryByLabelText('问问小文')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '查看对话记录' })).not.toBeInTheDocument();
  const history = screen.getByRole('button', { name: '查看修改记录' });
  expect(history.closest('.sheet-header-actions')).toBeInTheDocument();
  expect(document.querySelector('.ai-record-entry')).toBeNull();
  fireEvent.click(history);
  expect(screen.getByRole('dialog', { name: '修改记录' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '返回上一级' }));
  expect(screen.getByRole('dialog', { name: '文章优化' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '进入小文会话并输入需求' }));
  expect(screen.getByLabelText('问问小文')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('问问小文'), { target: { value: '还没发送的调整要求' } });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.getByRole('dialog', { name: '文章优化' })).toBeInTheDocument();
  expect(screen.queryByLabelText('问问小文')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '进入小文会话并输入需求' }));
  expect(screen.getByLabelText('问问小文')).toHaveValue('还没发送的调整要求');
  fireEvent.click(screen.getByRole('button', { name: '返回上一级' }));
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus(); expect(transport).not.toHaveBeenCalled();
});
it('sizes the application to Visual Viewport changes so editor chrome remains in the same canvas', async () => {
  const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const listeners = new Map<string, Set<() => void>>();
  const viewport = {
    height: 844, offsetTop: 0,
    addEventListener: (name: string, listener: () => void) => { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); },
    removeEventListener: (name: string, listener: () => void) => { listeners.get(name)?.delete(listener); },
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  try {
    const { container } = render(<ProductApp repository={repo()} />);
    await startWriting();
    const shell = container.querySelector<HTMLElement>('.phone-shell')!;
    expect(shell.style.getPropertyValue('--visual-viewport-height')).toBe('844px');
    act(() => { viewport.height = 416; viewport.offsetTop = 96; listeners.get('resize')?.forEach(listener => listener()); });
    expect(shell.style.getPropertyValue('--visual-viewport-height')).toBe('416px');
    expect(shell.style.getPropertyValue('--visual-viewport-offset')).toBe('96px');
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    for (const name of ['语音输入', '文字输入', '聊天引导', '文章优化']) expect(screen.getByRole(name.includes('输入') ? 'tab' : 'button', { name })).toBeInTheDocument();
  } finally {
    if (original) Object.defineProperty(window, 'visualViewport', original);
    else delete (window as unknown as { visualViewport?: VisualViewport }).visualViewport;
  }
});
it('hides the whole default speech stage and reopens it from single/double body taps', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  const before = (await repository.load()).works[0].draft.textDraft;
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  fireEvent.click(screen.getByRole('button', { name: '收起语音输入' }));
  expect(screen.queryByRole('button', { name: '按住说话' })).not.toBeInTheDocument();
  expect(screen.queryByText('展开语音输入')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  expect(screen.getByRole('button', { name: '按住说话' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '语音输入' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: '收起语音输入' }));
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  fireEvent.click(screen.getByRole('group', { name: '文章正文' }));
  expect(screen.getByRole('textbox', { name: '文章正文' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: '文字输入' })).toHaveAttribute('aria-selected', 'true');
  expect((await repository.load()).works[0].draft.textDraft).toBe(before);
});
it('uses a bounded autosizing conversation input beside voice and explicit send controls', async () => {
  render(<ProductApp repository={repo()} />); await startWriting();
  fireEvent.click(screen.getByRole('button', { name: '聊天引导' }));
  const input = screen.getByLabelText<HTMLTextAreaElement>('问问小文');
  expect(input.rows).toBe(1);
  expect(input.style.height).toBe('52px');
  expect(input).toHaveAttribute('placeholder', '问小文，或提要求');
  Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 220 });
  fireEvent.change(input, { target: { value: '请只调整第二段。'.repeat(30) } });
  expect(input.style.height).toBe('148px');
  expect(input.style.overflowY).toBe('auto');
  expect(screen.getByRole('button', { name: '按住说话输入要求' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '发送' })).toBeEnabled();
  fireEvent.change(input, { target: { value: '' } });
  expect(input.style.height).toBe('52px');
  expect(input.style.overflowY).toBe('hidden');
});
it('keeps an optimization request running when its conversation returns to the menu', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  let continueRequest = () => {};
  let requestSignal: AbortSignal | undefined;
  const transport = vi.fn(async (request: AiRequest, signal: AbortSignal) => {
    requestSignal = signal;
    await new Promise<void>(resolve => { continueRequest = resolve; });
    return { requestId: request.requestId, result: { answer: '整理完成。', body: `${request.current.body}\n`, citedVersionIds: [] } };
  });
  render(<ProductApp repository={repo()} aiTransport={transport} />); await startWriting();
  fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  fireEvent.click(screen.getByRole('button', { name: /^常规优化/ }));
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.getByRole('dialog', { name: '文章优化' })).toBeInTheDocument();
  expect(screen.getByText('正在处理…')).toBeInTheDocument();
  expect(requestSignal?.aborted).toBe(false);
  continueRequest();
  await waitFor(() => expect(screen.queryByText('正在处理…')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '进入小文会话并输入需求' }));
  expect(await screen.findByText('整理完成。')).toBeInTheDocument();
});
it('closes the assistant directly when the conversation starts from chat', async () => {
  render(<ProductApp repository={repo()} />); await startWriting();
  const opener = screen.getByRole('button', { name: '聊天引导' }); opener.focus(); fireEvent.click(opener);
  expect(screen.getByRole('dialog', { name: '和小文聊一聊' })).toBeInTheDocument();
  expect(screen.queryByText(/“问小文”只回答/)).not.toBeInTheDocument();
  expect(screen.queryByText('这篇文章的对话')).not.toBeInTheDocument();
  expect(screen.queryByText(/我会结合这篇文章/)).not.toBeInTheDocument();
  const history = screen.getByRole('button', { name: '查看修改记录' });
  expect(history.closest('.sheet-header-actions')).toBeInTheDocument();
  expect(screen.queryByText('查看修改记录')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '按住说话输入要求' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /问小文|调整文章/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus();
});
it('keeps copy failures persistent while ordinary assistant notices are transient', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  fireEvent.click(screen.getByRole('button', { name: '查看修改记录' }));
  fireEvent.click(screen.getByRole('button', { name: /手动编辑/ }));
  fireEvent.click(screen.getByRole('button', { name: '复制这份正文' }));
  const warning = await screen.findByRole('alert');
  expect(warning).toHaveClass('ai-feedback');
  expect(warning).toHaveTextContent('浏览器未允许复制');
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(3100));
  expect(warning).toBeInTheDocument();
});
it('shows a one-time quiet optimization hint without moving typing focus', async () => {
  const view = render(<ProductApp repository={repo()} />); await startWriting();
  vi.useFakeTimers();
  const body = screen.getByLabelText('文章正文');
  body.focus();
  fireEvent.change(body, { target: { value: '这是一段已经写好的生活记录。'.repeat(8) } });
  expect(screen.getByLabelText('优化提示')).toHaveTextContent('写好后，点“优化”帮您整理文章。');
  expect(body).toHaveFocus();
  expect(localStorage.getItem('suiyue-optimize-tip-v1')).toBe('yes');
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.queryByLabelText('优化提示')).not.toBeInTheDocument();
  fireEvent.change(body, { target: { value: '这是一段已经写好的生活记录。'.repeat(9) } });
  expect(screen.queryByLabelText('优化提示')).not.toBeInTheDocument();
  view.unmount();
  vi.useRealTimers();
});
it('uses concise elder-friendly wording in modification records and hides empty entries', async () => {
  render(<ProductApp repository={repo()} />); await startWriting();
  fireEvent.change(screen.getByRole('textbox', { name: '文章正文' }), { target: { value: '雨落在窗前。' } });
  fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  fireEvent.click(screen.getByRole('button', { name: '查看修改记录' }));
  expect(screen.getByRole('dialog', { name: '修改记录' })).toBeInTheDocument();
  expect(screen.getByText('修改会自动留下记录。以前已经丢失的内容无法找回。')).toBeInTheDocument();
  const record = screen.getByRole('button', { name: /手动编辑/ });
  expect(record).toHaveTextContent(/\d+ 字$/);
  expect(record).not.toHaveTextContent(/字符|\d{2}:\d{2}:\d{2}/);
  expect(screen.queryByText('开始记录')).not.toBeInTheDocument();
});
