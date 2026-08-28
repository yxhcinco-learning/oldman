import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DemoApp } from '../features/demo/DemoApp';
import { emptyDraft } from '../lib/domain/writing';

function openOptimization() {
  const source = { ...emptyDraft(), title: '夏日的雨', segments: [{ id: 'paragraph', text: '窗前的雨，落进了风里。' }] };
  const exit = vi.fn();
  const view = render(<DemoApp source={source} entry="optimize" onExit={exit} />);
  return { source, exit, ...view };
}

it.each([
  ['内容类型', '散文'], ['内容类型', '生活随笔'], ['内容类型', '诗歌'], ['内容类型', '口述故事'],
  ['文风调整', '朴实真诚'], ['文风调整', '温暖叙事'], ['文风调整', '文学散文'], ['文风调整', '轻松幽默'],
  ['格式整理', '自动分段'], ['格式整理', '修正标点'], ['格式整理', '添加小标题'],
])('preserves the %s / %s interaction and source document', (group, option) => {
  const { source, exit } = openOptimization(); const before = structuredClone(source);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(group) }));
  fireEvent.click(screen.getByRole('button', { name: option }));
  expect(screen.getByRole('dialog')).toHaveTextContent(`按“${option}”优化`);
  fireEvent.click(screen.getByRole('button', { name: '应用优化' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  expect(screen.getByRole('group', { name: '文章正文' })).toHaveTextContent('窗前的雨，落进了风里。');
  fireEvent.click(screen.getByRole('button', { name: '结束演示' }));
  expect(exit).toHaveBeenCalledOnce(); expect(source).toEqual(before);
});

it('keeps three illustration candidates and uses local SVG without remote images', () => {
  const { container } = openOptimization();
  fireEvent.click(screen.getByRole('button', { name: /AI 配图/ }));
  expect(within(screen.getByRole('dialog')).getAllByRole('figure')).toHaveLength(3);
  expect(container.querySelectorAll('.image-options .story-drawing')).toHaveLength(3);
  expect(container.querySelector('img')).toBeNull();
});

it('contains keyboard focus, preserves typing focus and closes with Escape', async () => {
  const user = userEvent.setup(); openOptimization();
  await user.click(screen.getByRole('button', { name: /其他要求/ }));
  const input = screen.getByRole('textbox', { name: '自定义优化要求' });
  await user.type(input, '保留我的口吻'); expect(input).toHaveFocus();
  expect(input).toHaveValue('保留我的口吻');
  const apply = screen.getByRole('button', { name: '让小文试着改改' });
  apply.focus(); await user.tab(); expect(screen.getByRole('button', { name: '返回优化选项' })).toHaveFocus();
  await user.tab({ shift: true }); expect(apply).toHaveFocus();
  await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('演示模式 · 不影响作品')).toBeVisible();
});
