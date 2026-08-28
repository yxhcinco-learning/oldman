import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductApp } from '../features/writing/ProductApp';
import { emptyDraft, articleText, type Draft, type Segment } from '../lib/domain/writing';
import { IndexedWorkRepository } from '../lib/storage/repository';

const placeholder = '在这里输入想写的话……';
const repositories: IndexedWorkRepository[] = [];
const repository = () => {
  const result = new IndexedWorkRepository(crypto.randomUUID());
  repositories.push(result);
  return result;
};
afterEach(async () => { for (const repo of repositories.splice(0)) await repo.close(); });

async function openDraft(draft: Draft) {
  const repo = repository();
  await repo.save(draft, 0);
  const view = render(<ProductApp repository={repo} />);
  await screen.findByLabelText('文章标题');
  return { repo, ...view };
}
function voiceDraft(segments: Segment[], pendingVoice = ''): Draft {
  return { ...emptyDraft(), segments, textDraft: articleText(segments), pendingVoice };
}

it('shares empty title/body copy and presentation classes across modes without list decoration', async () => {
  const { repo, container } = await openDraft(emptyDraft());
  const title = screen.getByLabelText('文章标题');
  const preview = screen.getByRole('group', { name: '文章正文' });
  expect(title).toHaveAttribute('placeholder', '输入标题');
  expect(preview).toHaveClass('full-text-editor', 'writing-body');
  expect(within(preview).getByText(placeholder)).toHaveClass('writing-placeholder');
  expect(container.querySelector('.story-content, .story-paragraph, .empty-writing')).toBeNull();
  const canvasClass = preview.parentElement?.className;
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  const input = screen.getByRole('textbox', { name: '文章正文' });
  expect(input).toHaveAttribute('placeholder', placeholder);
  expect(input).toHaveClass('full-text-editor', 'writing-body');
  expect(input.parentElement?.className).toBe(canvasClass);
  expect(screen.getByLabelText('文章标题')).toBe(title);
  expect(input).toHaveFocus();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  expect(within(screen.getByRole('group', { name: '文章正文' })).getByText(placeholder)).toBeVisible();
  await screen.findByText('已保存到本机');
  expect((await repo.load()).works).toEqual([]);
  expect((await repo.load()).recovery?.draft.textDraft).toBe('');
});

it.each([
  ['单段', [{ id: 'first', text: '我年轻的时候在钢厂。' }]],
  ['多段和换行', [{ id: 'first', text: '窗前的雨\n落进了风里' }, { id: 'second', text: '  两个空格\t保留。' }]],
  ['长文', [{ id: 'first', text: '这是一段用于检查正文换行的文字。'.repeat(100) }, { id: 'second', text: 'https://example.test/' + 'a'.repeat(160) }]],
])('renders %s as undecorated text while keeping contents, IDs and paragraph editing', async (_name, segments) => {
  const draft = voiceDraft(segments);
  const { repo, container } = await openDraft(draft);
  const preview = screen.getByRole('group', { name: '文章正文' });
  const buttons = within(preview).getAllByRole('button');
  expect(buttons).toHaveLength(segments.length);
  buttons.forEach((button, index) => {
    expect(button.textContent).toBe(segments[index].text);
    expect(button).toHaveClass('writing-paragraph');
    expect(button).toHaveAccessibleName(`编辑第 ${index + 1} 段`);
    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild?.textContent).toBe(segments[index].text);
  });
  expect(container.querySelector('.story-content, .story-paragraph')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue(draft.textDraft);
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.segments).toEqual(segments);
  expect((await repo.load()).recovery?.draft.textDraft).toBe(draft.textDraft);
});

it('keeps native keyboard activation and restores the common placeholder after deleting the last paragraph', async () => {
  const { repo } = await openDraft(voiceDraft([{ id: 'first', text: '最后一段' }]));
  const user = userEvent.setup();
  screen.getByRole('button', { name: '编辑第 1 段' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('段落内容')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '完成修改' }));
  expect(within(screen.getByRole('group', { name: '文章正文' })).getByText(placeholder)).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue('');
  expect(screen.getByLabelText('文章正文')).toHaveAttribute('placeholder', placeholder);
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.textDraft).toBe('');
});

it('keeps pending speech separate, clears it independently and appends it only on confirmation', async () => {
  const initial = voiceDraft([{ id: 'first', text: '已确认的正文。' }], '待确认语音。');
  const { repo, rerender } = await openDraft(initial);
  expect(within(screen.getByRole('group', { name: '文章正文' })).queryByText('待确认语音。')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清空' }));
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.segments).toEqual(initial.segments);
  expect(screen.queryByRole('button', { name: '修改待确认转写' })).not.toBeInTheDocument();
  // Reopen a saved pending result without invoking the microphone or a paid service.
  const nextRepo = repository();
  await nextRepo.save(initial, 0);
  rerender(<ProductApp key="pending-voice" repository={nextRepo} />);
  await screen.findByRole('button', { name: '修改待确认转写' });
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(screen.getByRole('button', { name: '编辑第 2 段' })).toHaveTextContent('待确认语音。');
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue('已确认的正文。\n\n待确认语音。');
  await screen.findByText('已保存到本机');
  expect((await nextRepo.load()).recovery?.draft.pendingVoice).toBe('');
});

it('restores the uniform preview after completing a recovered unfinished edit', async () => {
  const draft = voiceDraft([{ id: 'first', text: '原文' }, { id: 'second', text: '不变的第二段' }]);
  draft.segmentEdit = { id: 'first', text: '尚未完成的修改\n下一行' };
  const repo = repository();
  await repo.save(draft, 0);
  render(<ProductApp repository={repo} />);
  expect(await screen.findByLabelText('段落内容')).toHaveValue(draft.segmentEdit.text);
  fireEvent.click(screen.getByRole('button', { name: '完成修改' }));
  const preview = screen.getByRole('group', { name: '文章正文' });
  expect(preview).toHaveClass('writing-body');
  expect(within(preview).getByRole('button', { name: '编辑第 1 段' }).textContent).toBe(draft.segmentEdit.text);
  expect(within(preview).getByRole('button', { name: '编辑第 2 段' }).textContent).toBe('不变的第二段');
  await waitFor(async () => expect((await repo.load()).recovery?.draft.segmentEdit).toBeNull());
});

it('retains the text and existing rescue controls when saving after a mode switch fails', async () => {
  const { repo } = await openDraft(voiceDraft([{ id: 'first', text: '需要保留的原文' }]));
  vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('保存失败，请先备份'));
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，请先备份');
  expect(screen.getByLabelText('文章正文')).toHaveValue('需要保留的原文');
  expect(screen.getByRole('button', { name: '导出当前备份' })).toBeVisible();
  expect(screen.getByRole('button', { name: '重试' })).toHaveAccessibleDescription('尚未保存，请先备份');
  fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.textDraft).toBe('需要保留的原文');
});
