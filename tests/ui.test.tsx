import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import { IndexedWorkRepository } from '../lib/storage/repository';

const repos: IndexedWorkRepository[] = [];
const repo = () => { const r = new IndexedWorkRepository(crypto.randomUUID()); repos.push(r); return r; };
afterEach(async () => { for (const r of repos.splice(0)) await r.close(); });
async function startWriting() {
  fireEvent.click(await screen.findByRole('button', { name: /开始写作/ }));
  fireEvent.change(await screen.findByLabelText('文章标题'), { target: { value: '夏日有感' } });
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  fireEvent.change(screen.getByLabelText('文章正文'), { target: { value: '窗前的雨\n落进了风里\n\n我想把这一刻写下来。' } });
  await screen.findByText('已保存到本机');
}
it('writes, edits a segment, saves, reopens and restores from IndexedDB', async () => {
  const repository = repo(); const view = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' })); fireEvent.click(screen.getByRole('button', { name: '编辑第 1 段' }));
  fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '我修改了这一段。' } });
  fireEvent.click(screen.getByRole('button', { name: '完成修改' })); fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByRole('heading', { name: '我的作品' }); expect((await repository.load()).works[0].segments[0].text).toBe('我修改了这一段。');
  view.unmount(); render(<ProductApp repository={repository} />); fireEvent.click(await screen.findByRole('button', { name: /夏日有感.*继续写/ }));
  expect(await screen.findByText('我修改了这一段。')).toBeInTheDocument();
});
it('keeps real writing unchanged after custom optimization and undo in demo', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting();
  const before = (await repository.load()).works[0]; fireEvent.click(screen.getByRole('button', { name: '文章优化' }));
  expect(screen.getByText('演示模式 · 不影响作品')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /其他要求/ })); fireEvent.change(screen.getByLabelText('自定义优化要求'), { target: { value: '写成一首诗，保留原意' } });
  fireEvent.click(screen.getByRole('button', { name: '让小文试着改改' })); fireEvent.click(screen.getByRole('button', { name: '应用优化' }));
  fireEvent.click(screen.getByRole('button', { name: '撤销' })); fireEvent.click(screen.getByRole('button', { name: '退出演示' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue(before.draft.textDraft);
  expect((await repository.load()).works[0]).toEqual(before);
});
it('preserves chat mock flow but never writes its answers into real works', async () => {
  const repository = repo(); render(<ProductApp repository={repository} />); await startWriting(); const before = (await repository.load()).works[0];
  fireEvent.click(screen.getByRole('button', { name: '聊天引导' })); const hold = screen.getByRole('button', { name: '按住说话' });
  vi.useFakeTimers(); fireEvent.keyDown(hold, { key: 'Enter' }); await act(() => vi.advanceTimersByTimeAsync(1200)); fireEvent.keyUp(hold, { key: 'Enter' }); await act(() => vi.advanceTimersByTimeAsync(1000)); vi.useRealTimers();
  fireEvent.click(screen.getByRole('button', { name: '完成' })); expect(screen.getByText(/已把.*聊天内容整理进正文/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '退出演示' })); expect((await repository.load()).works[0]).toEqual(before);
});
it('recovers an unfinished edit after remount', async () => {
  const repository = repo(); const view = render(<ProductApp repository={repository} />); await startWriting();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' })); fireEvent.click(screen.getByRole('button', { name: '编辑第 1 段' }));
  fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '还没点完成的修改' } });
  await waitFor(async () => expect((await repository.load()).recovery?.draft.segmentEdit?.text).toBe('还没点完成的修改'));
  view.unmount(); render(<ProductApp repository={repository} />); expect(await screen.findByLabelText('段落内容')).toHaveValue('还没点完成的修改');
});
