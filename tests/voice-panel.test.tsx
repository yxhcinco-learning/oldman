import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VoicePanel } from '../features/speech/VoicePanel';

afterEach(() => { localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('requires informed consent, and missing service never requests a microphone', async () => {
  vi.useFakeTimers(); const fetchStatus = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: false }) });
  vi.stubGlobal('fetch', fetchStatus); vi.stubGlobal('AudioContext', class {});
  const getUserMedia = vi.fn(); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const onPending = vi.fn(); render(<VoicePanel pending="" onPending={onPending} onEdit={() => {}} onDone={() => {}} />);
  const hold = screen.getByRole('button', { name: '按住说话' });
  fireEvent.keyDown(hold, { key: 'Enter' }); await act(() => vi.advanceTimersByTimeAsync(180)); fireEvent.keyUp(hold, { key: 'Enter' });
  expect(screen.getByRole('dialog', { name: '开启语音输入' })).toBeInTheDocument(); expect(fetchStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '同意，继续' }));
  fireEvent.keyDown(hold, { key: 'Enter' }); await act(() => vi.advanceTimersByTimeAsync(180)); fireEvent.keyUp(hold, { key: 'Enter' });
  expect(screen.getByText(/尚未配置腾讯云凭据/)).toBeInTheDocument(); expect(getUserMedia).not.toHaveBeenCalled(); expect(onPending).not.toHaveBeenCalled();
});
it('keeps pending review editable and clear/complete actions independent', () => {
  const pending = vi.fn(), edit = vi.fn(), done = vi.fn(); render(<VoicePanel pending="待确认内容" onPending={pending} onEdit={edit} onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: '修改待确认转写' })); expect(edit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '完成' })); expect(done).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '清空' })); expect(pending).toHaveBeenCalledWith('');
});
it('offers a presentation-only collapse without clearing pending text', () => {
  const pending = vi.fn(), collapse = vi.fn();
  render(<VoicePanel pending="仍待确认" onPending={pending} onEdit={() => {}} onDone={() => {}} onCollapse={collapse} />);
  fireEvent.click(screen.getByRole('button', { name: '收起语音输入' }));
  expect(collapse).toHaveBeenCalledOnce();
  expect(pending).not.toHaveBeenCalled();
  expect(screen.getByText('仍待确认')).toBeInTheDocument();
});
