import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProductApp } from '../features/writing/ProductApp';
import { emptyDraft, articleText, type Draft, type Segment } from '../lib/domain/writing';
import { IndexedWorkRepository } from '../lib/storage/repository';

const placeholder = '从想说的一句话开始……';
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
  await screen.findByRole('button', { name: '编辑文章标题' });
  return { repo, ...view };
}
function voiceDraft(segments: Segment[], pendingVoice = ''): Draft {
  return { ...emptyDraft(), segments, textDraft: articleText(segments), pendingVoice };
}

type PointCaretDocument = {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};
function stubPointCaretApis({ position, range }: {
  position?: PointCaretDocument['caretPositionFromPoint'];
  range?: PointCaretDocument['caretRangeFromPoint'];
}) {
  const pointDocument = document as unknown as PointCaretDocument;
  const positionDescriptor = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
  const rangeDescriptor = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
  Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: position });
  Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: range });
  return () => {
    if (positionDescriptor) Object.defineProperty(document, 'caretPositionFromPoint', positionDescriptor);
    else delete pointDocument.caretPositionFromPoint;
    if (rangeDescriptor) Object.defineProperty(document, 'caretRangeFromPoint', rangeDescriptor);
    else delete pointDocument.caretRangeFromPoint;
  };
}

it('uses a header title trigger and shares body presentation across modes without list decoration', async () => {
  const { repo, container } = await openDraft(emptyDraft());
  const title = screen.getByRole('button', { name: '编辑文章标题' });
  const preview = screen.getByRole('group', { name: '文章正文' });
  expect(title).toHaveTextContent('点击编辑标题');
  expect(container.querySelector('.editor-scroll .title-input')).toBeNull();
  expect(preview).toHaveClass('full-text-editor', 'writing-body');
  expect(within(preview).getByText(placeholder)).toHaveClass('writing-placeholder');
  expect(container.querySelector('.story-content, .story-paragraph, .empty-writing')).toBeNull();
  const canvasClass = preview.parentElement?.className;
  const textTab = screen.getByRole('tab', { name: '文字输入' });
  expect(textTab.querySelector('.keyboard-icon')).not.toBeNull();
  fireEvent.click(textTab);
  const input = screen.getByRole('textbox', { name: '文章正文' });
  expect(input).toHaveAttribute('placeholder', placeholder);
  expect(input).toHaveClass('full-text-editor', 'writing-body');
  expect(input.parentElement?.className).toBe(canvasClass);
  expect(screen.getByRole('button', { name: '编辑文章标题' })).toBe(title);
  expect(input).toHaveFocus();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  expect(within(screen.getByRole('group', { name: '文章正文' })).getByText(placeholder)).toBeVisible();
  await screen.findByText('已保存到本机');
  expect((await repo.load()).works).toEqual([]);
  expect((await repo.load()).recovery?.draft.textDraft).toBe('');
});

it('confirms or cancels a native title dialog without changing the body mode', async () => {
  const initial = voiceDraft([{ id: 'first', text: '已经写好的正文。' }], '还没有确认的语音。');
  initial.title = '原标题';
  const { repo } = await openDraft(initial);
  const title = screen.getByRole('button', { name: '编辑文章标题' });
  expect(title).toHaveTextContent('原标题');

  fireEvent.click(title);
  let dialog = screen.getByRole('dialog', { name: '编辑标题' });
  let input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: '文章标题' });
  await waitFor(() => expect(input).toHaveFocus());
  expect(input).toHaveValue('原标题');
  fireEvent.change(input, { target: { value: '不保存的标题' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog', { name: '编辑标题' })).not.toBeInTheDocument();
  expect(title).toHaveTextContent('原标题');
  expect(screen.getByRole('tab', { name: '语音输入' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: '修改待确认转写' })).toHaveTextContent('还没有确认的语音。');

  fireEvent.click(title);
  dialog = screen.getByRole('dialog', { name: '编辑标题' });
  input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: '文章标题' });
  fireEvent.change(input, { target: { value: '页头里的标题' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '完成' }));
  expect(title).toHaveTextContent('页头里的标题');
  expect(screen.getByRole('tab', { name: '语音输入' })).toHaveAttribute('aria-selected', 'true');
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.title).toBe('页头里的标题');
  expect((await repo.load()).recovery?.draft.pendingVoice).toBe('还没有确认的语音。');
});

it.each([
  ['单段', [{ id: 'first', text: '我年轻的时候在钢厂。' }]],
  ['多段和换行', [{ id: 'first', text: '窗前的雨\n落进了风里' }, { id: 'second', text: '  两个空格\t保留。' }]],
  ['长文', [{ id: 'first', text: '这是一段用于检查正文换行的文字。'.repeat(100) }, { id: 'second', text: 'https://example.test/' + 'a'.repeat(160) }]],
])('renders %s as undecorated text and opens current-page editing on a double click', async (_name, segments) => {
  const draft = voiceDraft(segments);
  const { repo, container } = await openDraft(draft);
  const preview = screen.getByRole('group', { name: '文章正文' });
  const paragraphs = preview.querySelectorAll('.writing-paragraph');
  expect(paragraphs).toHaveLength(segments.length);
  paragraphs.forEach((paragraph, index) => {
    expect(paragraph.textContent).toBe(segments[index].text);
    expect(paragraph.children).toHaveLength(1);
    expect(paragraph.firstElementChild?.textContent).toBe(segments[index].text);
  });
  expect(within(preview).queryByRole('button')).not.toBeInTheDocument();
  expect(container.querySelector('.story-content, .story-paragraph')).toBeNull();
  fireEvent.click(preview);
  fireEvent.click(preview);
  expect(screen.getByLabelText('文章正文')).toHaveValue(draft.textDraft);
  expect(screen.getByLabelText('文章正文')).toHaveFocus();
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.segments).toEqual(segments);
  expect((await repo.load()).recovery?.draft.textDraft).toBe(draft.textDraft);
});

it('places the collapsed text caret at the second tap through the standard point API', async () => {
  const segments = [{ id: 'first', text: '前🙂后\n换行' }, { id: 'second', text: '第二段文字' }];
  const draft = voiceDraft(segments);
  const { repo } = await openDraft(draft);
  const preview = screen.getByRole('group', { name: '文章正文' });
  const secondText = preview.querySelectorAll('.writing-paragraph span')[1].firstChild!;
  const position = vi.fn(() => ({ offsetNode: secondText, offset: 3 }));
  const restore = stubPointCaretApis({ position });
  try {
    fireEvent.click(preview, { clientX: 12, clientY: 18 });
    fireEvent.click(preview, { clientX: 48, clientY: 52 });
    const body = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '文章正文' });
    const expected = segments[0].text.length + 2 + 3;
    expect(position).toHaveBeenCalledWith(48, 52);
    expect(body).toHaveFocus();
    expect(body.selectionStart).toBe(expected);
    expect(body.selectionEnd).toBe(expected);
    expect(body).toHaveValue(draft.textDraft);
  } finally { restore(); }
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.textDraft).toBe(draft.textDraft);
});

it('uses the WebKit point API and falls back to the article end outside a paragraph', async () => {
  const segments = [{ id: 'first', text: '第一段' }, { id: 'second', text: '结尾段落' }];
  const draft = voiceDraft(segments);
  const { unmount } = await openDraft(draft);
  let preview = screen.getByRole('group', { name: '文章正文' });
  const secondText = preview.querySelectorAll('.writing-paragraph span')[1].firstChild!;
  const webkitRange = document.createRange();
  webkitRange.setStart(secondText, 2);
  const range = vi.fn(() => webkitRange);
  let restore = stubPointCaretApis({ range });
  try {
    fireEvent.click(preview);
    fireEvent.click(preview, { clientX: 40, clientY: 44 });
    const body = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '文章正文' });
    expect(range).toHaveBeenCalledWith(40, 44);
    expect(body.selectionStart).toBe(segments[0].text.length + 2 + 2);
    expect(body.selectionEnd).toBe(body.selectionStart);
  } finally { restore(); }

  unmount();
  await openDraft(draft);
  preview = screen.getByRole('group', { name: '文章正文' });
  restore = stubPointCaretApis({ position: () => ({ offsetNode: preview, offset: 0 }) });
  try {
    fireEvent.click(preview);
    fireEvent.click(preview);
    const body = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '文章正文' });
    expect(body.selectionStart).toBe(draft.textDraft.length);
    expect(body.selectionEnd).toBe(draft.textDraft.length);
  } finally { restore(); }
});

it('switches a stationary touch long-press at its point without cancelling native events', async () => {
  const segments = [{ id: 'first', text: '长按这里进入文字输入' }];
  await openDraft(voiceDraft(segments));
  const preview = screen.getByRole('group', { name: '文章正文' });
  const textNode = preview.querySelector('.writing-paragraph span')!.firstChild!;
  const restore = stubPointCaretApis({ position: () => ({ offsetNode: textNode, offset: 4 }) });
  vi.useFakeTimers();
  try {
    expect(fireEvent.pointerDown(preview, { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: 44, clientY: 52 })).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(599));
    expect(screen.getByRole('group', { name: '文章正文' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1));
    const body = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '文章正文' });
    expect(body).toHaveFocus();
    expect(body.selectionStart).toBe(4);
    expect(body.selectionEnd).toBe(4);
    expect(body).toHaveValue(segments[0].text);
  } finally {
    restore();
    vi.useRealTimers();
  }
});

it('lets native touch context menus trigger the same entry and cancels a moved long-press', async () => {
  const segments = [{ id: 'first', text: '移动时应该继续滚动' }];
  const first = await openDraft(voiceDraft(segments));
  let preview = screen.getByRole('group', { name: '文章正文' });
  const textNode = preview.querySelector('.writing-paragraph span')!.firstChild!;
  const restore = stubPointCaretApis({ position: () => ({ offsetNode: textNode, offset: 2 }) });
  try {
    expect(fireEvent.pointerDown(preview, { pointerId: 8, pointerType: 'touch', isPrimary: true, button: 0, clientX: 30, clientY: 36 })).toBe(true);
    expect(fireEvent.contextMenu(preview, { clientX: 30, clientY: 36 })).toBe(true);
    const body = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '文章正文' });
    expect(body.selectionStart).toBe(2);
    expect(body.selectionEnd).toBe(2);

    first.unmount();
    await openDraft(voiceDraft(segments));
    preview = screen.getByRole('group', { name: '文章正文' });
    vi.useFakeTimers();
    fireEvent.pointerDown(preview, { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: 20, clientY: 24 });
    expect(fireEvent.pointerMove(preview, { pointerId: 9, pointerType: 'touch', clientX: 35, clientY: 24 })).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(screen.getByRole('group', { name: '文章正文' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '文章正文' })).not.toBeInTheDocument();

    fireEvent.pointerDown(preview, { pointerId: 10, pointerType: 'touch', isPrimary: true, button: 0, clientX: 20, clientY: 24 });
    await act(() => vi.advanceTimersByTimeAsync(599));
    fireEvent.pointerUp(preview, { pointerId: 10, pointerType: 'touch', clientX: 20, clientY: 24 });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('group', { name: '文章正文' })).toBeInTheDocument();
  } finally {
    restore();
    vi.useRealTimers();
  }
});

it('opens pending speech editing with a collapsed caret at the clicked transcript position', async () => {
  const pending = '这段待确认文字需要修改';
  await openDraft(voiceDraft([{ id: 'first', text: '已有正文' }], pending));
  const editButton = screen.getByRole('button', { name: '修改待确认转写' });
  const pendingText = editButton.querySelector('.pending-transcript-text');
  expect(pendingText).not.toBeNull();
  const textNode = pendingText!.firstChild!;
  const restore = stubPointCaretApis({ position: () => ({ offsetNode: textNode, offset: 5 }) });
  try {
    fireEvent.click(editButton, { clientX: 62, clientY: 70 });
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '段落内容' });
    expect(editor).toHaveFocus();
    expect(editor.selectionStart).toBe(5);
    expect(editor.selectionEnd).toBe(5);
    expect(editor).toHaveValue(pending);
    expect(screen.queryByText('已有正文')).not.toBeInTheDocument();
    expect(screen.queryByText('让这段话，更像您想说的。')).not.toBeInTheDocument();
  } finally { restore(); }
});

it('cancels pending-speech edits from the top left without replacing the original transcript', async () => {
  const pending = '原来的待确认文字';
  await openDraft(voiceDraft([{ id: 'first', text: '已有正文' }], pending));
  fireEvent.click(screen.getByRole('button', { name: '修改待确认转写' }));
  const editor = screen.getByRole('textbox', { name: '段落内容' });
  fireEvent.change(editor, { target: { value: '不应保存的改动' } });
  const cancel = screen.getByRole('button', { name: '取消修改' });
  expect(cancel).toHaveTextContent('取消');
  const topbar = cancel.closest('.topbar');
  expect(topbar).not.toBeNull();
  expect(topbar?.firstElementChild).toBe(cancel);
  expect(topbar?.lastElementChild).toHaveClass('topbar-spacer');
  fireEvent.click(cancel);
  expect(screen.getByRole('button', { name: '修改待确认转写' })).toHaveTextContent(pending);
  expect(screen.queryByLabelText('段落内容')).not.toBeInTheDocument();
});

it('edits ordinary article text on the current page and restores the placeholder after deleting it', async () => {
  const { repo } = await openDraft(voiceDraft([{ id: 'first', text: '最后一段' }]));
  const preview = screen.getByRole('group', { name: '文章正文' });
  fireEvent.click(preview);
  fireEvent.click(preview);
  const body = screen.getByRole('textbox', { name: '文章正文' });
  expect(body).toHaveFocus();
  fireEvent.change(body, { target: { value: '' } });
  fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
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
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  await screen.findByText('已保存到本机');
  expect((await repo.load()).recovery?.draft.segments).toEqual(initial.segments);
  expect(screen.queryByRole('button', { name: '修改待确认转写' })).not.toBeInTheDocument();
  // Reopen a saved pending result without invoking the microphone or a paid service.
  const nextRepo = repository();
  await nextRepo.save(initial, 0);
  rerender(<ProductApp key="pending-voice" repository={nextRepo} />);
  await screen.findByRole('button', { name: '修改待确认转写' });
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(within(screen.getByRole('group', { name: '文章正文' })).getByText('待确认语音。')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
  expect(screen.getByLabelText('文章正文')).toHaveValue('已确认的正文。\n\n待确认语音。');
  await screen.findByText('已保存到本机');
  expect((await nextRepo.load()).recovery?.draft.pendingVoice).toBe('');
});

it('migrates a recovered unfinished ordinary edit into the current-page text editor', async () => {
  const draft = voiceDraft([{ id: 'first', text: '原文' }, { id: 'second', text: '不变的第二段' }]);
  draft.segmentEdit = { id: 'first', text: '尚未完成的修改\n下一行' };
  const repo = repository();
  await repo.save(draft, 0);
  render(<ProductApp repository={repo} />);
  const body = await screen.findByRole('textbox', { name: '文章正文' });
  expect(body).toHaveValue(`${draft.segmentEdit.text}\n\n不变的第二段`);
  expect(body).toHaveFocus();
  expect(screen.queryByLabelText('段落内容')).not.toBeInTheDocument();
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
