import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import { IndexedWorkRepository } from '../lib/storage/repository';
import { makeBackup } from '../lib/storage/backup';
import type { AiRequest } from '../features/ai/protocol';

const repos: IndexedWorkRepository[] = [];
const repo = () => { const r = new IndexedWorkRepository(crypto.randomUUID()); repos.push(r); return r; };
afterEach(async () => { localStorage.clear(); for (const r of repos.splice(0)) await r.close(); });
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
it('writes, edits a segment, saves, reopens and restores from IndexedDB', async () => {
  const repository = repo(); const view = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' })); fireEvent.click(screen.getByRole('button', { name: '编辑第 1 段' }));
  fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '我修改了这一段。' } });
  fireEvent.click(screen.getByRole('button', { name: '完成修改' })); fireEvent.click(await screen.findByRole('button', { name: '保存' }));
  await screen.findByRole('heading', { name: '我的作品' }); expect((await repository.load()).works[0].segments[0].text).toBe('我修改了这一段。');
  view.unmount(); render(<ProductApp repository={repository} />); fireEvent.click(await screen.findByRole('button', { name: /夏日有感.*继续写/ }));
  expect(await screen.findByText('我修改了这一段。')).toBeInTheDocument();
});
it('previews a real optimization before applying and persists an undo as history', async () => {
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId, result: { answer: '调整标点。', body: '窗前的雨，\n落进了风里。\n\n我想把这一刻写下来。', citedVersionIds: [] } }));
  const repository = repo(); render(<ProductApp repository={repository} aiTransport={transport} />); await startWriting();
  const before = (await repository.load()).works[0]; fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  expect(screen.queryByText('演示模式 · 不影响作品')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^常规优化/ })); expect(transport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '同意并继续' }));
  expect(await screen.findByRole('region', { name: '优化后全文' })).toHaveTextContent('窗前的雨，');
  expect((await repository.load()).works[0].draft.textDraft).toBe(before.draft.textDraft);
  fireEvent.click(screen.getByRole('button', { name: '对照原文' })); expect(screen.getByRole('region', { name: '优化前原文' })).toHaveTextContent('窗前的雨');
  fireEvent.click(screen.getByRole('button', { name: '应用优化' })); await screen.findByText('已应用优化并保存到本机。');
  expect((await repository.load()).works[0].draft.textDraft).toContain('窗前的雨，');
  fireEvent.click(screen.getByRole('button', { name: '撤销这次优化' })); await screen.findByText('已恢复并保存，其他历史版本仍然保留。');
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue(before.draft.textDraft);
  expect((await repository.load()).sessions[0].versions.at(-1)?.source).toBe('restore');
});
it('answers in the article conversation and exposes an actual cited version without modifying the body', async () => {
  localStorage.setItem('suiyue-article-ai-consent-v1', 'yes');
  const transport = vi.fn(async (request: AiRequest) => ({ requestId: request.requestId, result: { answer: '原文仍在这个版本中。', citedVersionIds: [request.current.id] } }));
  const repository = repo(); const view = render(<ProductApp repository={repository} aiTransport={transport} />); await startWriting(); const before = (await repository.load()).works[0];
  fireEvent.click(screen.getByRole('button', { name: '聊天引导' })); fireEvent.change(screen.getByLabelText('问问小文'), { target: { value: '我原来写的内容呢？' } });
  fireEvent.click(screen.getByRole('button', { name: '发送问题' })); await screen.findByText('原文仍在这个版本中。');
  fireEvent.click(screen.getByRole('button', { name: '查看引用版本 1' })); expect(screen.getByRole('region', { name: '历史版本正文' })).toHaveTextContent('窗前的雨');
  expect((await repository.load()).works[0].draft.textDraft).toEqual(before.draft.textDraft);
  view.unmount(); render(<ProductApp repository={repository} aiTransport={transport} />);
  fireEvent.click(await screen.findByRole('button', { name: '聊天引导' })); expect(await screen.findByText('原文仍在这个版本中。')).toBeInTheDocument();
  expect(transport).toHaveBeenCalledOnce();
});
it('recovers an unfinished edit after remount', async () => {
  const repository = repo(); const view = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' })); fireEvent.click(screen.getByRole('button', { name: '编辑第 1 段' }));
  fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '还没点完成的修改' } });
  await waitFor(async () => expect((await repository.load()).recovery?.draft.segmentEdit?.text).toBe('还没点完成的修改'));
  view.unmount(); render(<ProductApp repository={repository} />); expect(await screen.findByLabelText('段落内容')).toHaveValue('还没点完成的修改');
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
  fireEvent.click(screen.getByRole('button', { name: '编辑第 1 段' }));
  expect(screen.getByText('让这段话，更像您想说的。')).toBeInTheDocument();
  expect(container.querySelector('.segment-editor-wrap > p')).toHaveTextContent('9 字');
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
it('shows the new categories and keeps unsupported tools visibly unavailable', async () => {
  const transport = vi.fn(); render(<ProductApp repository={repo()} aiTransport={transport} />); await startWriting();
  const opener = screen.getByRole('button', { name: '文章优化' }); opener.focus(); fireEvent.click(opener);
  expect(screen.getByRole('button', { name: /^润色文笔/ })).toBeEnabled();
  for (const name of ['精简内容', '扩写内容', '添加配图']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /内容类型|文风调整|格式整理/ })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: '关闭' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus(); expect(transport).not.toHaveBeenCalled();
});
