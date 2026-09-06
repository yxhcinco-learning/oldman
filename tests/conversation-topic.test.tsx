import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationTopic } from '../features/ai/ConversationTopic';
afterEach(cleanup);
it('主题与文字操作同组，忙碌时禁止切换', () => {
  const toggle = vi.fn();
  const view = render(<ConversationTopic title="短主题" interview disabled={false} onToggle={toggle} />);
  const button = screen.getByRole('button', { name: '访谈已开启，结束访谈并整理' });
  expect(button.closest('.conversation-topic')).toContainElement(screen.getByText('短主题'));
  expect(screen.getByText('短主题')).not.toHaveClass('topic-moving');
  fireEvent.click(button); expect(toggle).toHaveBeenCalledOnce();
  view.rerender(<ConversationTopic interview={false} disabled onToggle={toggle} />);
  expect(screen.getByRole('button', { name: '开启访谈' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '开启访谈' }).closest('section')).toHaveClass('topic-absent');
  expect(document.querySelector('.topic-heading')).toBeNull();
});
