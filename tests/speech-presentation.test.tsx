import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SpeechState } from '../features/speech/session';
import { VoiceDictationButton } from '../features/speech/VoiceDictationButton';
import { VoicePanel } from '../features/speech/VoicePanel';

// Presentation-only events: no capture, sockets or paid recognition are used.
const bridge = vi.hoisted(() => ({
  emit: undefined as undefined | ((state: SpeechState) => void),
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../features/speech/session', () => ({
  SpeechSession: class {
    state = { phase: 'idle', text: '', elapsed: 0, level: 0, message: '' } as SpeechState;
    constructor(onChange: (state: SpeechState) => void) { bridge.emit = state => { this.state = state; onChange(state); }; }
    start() { bridge.start(); }
    stop() { bridge.stop(); }
    cancel() { bridge.cancel(); }
  },
}));
function Harness() {
  const [pending, setPending] = useState('');
  return <VoicePanel pending={pending} onPending={setPending} onEdit={() => {}} onDone={() => {}} />;
}
function emit(next: Partial<SpeechState>) {
  act(() => bridge.emit?.({ phase: 'idle', text: '', elapsed: 0, level: 0, message: '', ...next }));
}

beforeEach(() => { bridge.start.mockClear(); bridge.stop.mockClear(); bridge.cancel.mockClear(); });
afterEach(() => { localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('retains the same microphone and stage through all real recognition phases', () => {
  const { container } = render(<Harness />);
  const mic = screen.getByRole('button', { name: '按住说话' });
  const stage = container.querySelector('.transcript-stage');
  for (const phase of ['permission', 'connecting', 'recording', 'finishing', 'idle', 'error'] as const) {
    emit({ phase, elapsed: 12, message: phase === 'error' ? '网络连接已中断' : '', text: '第一行。\n第二行。\n第三行。', level: .7 });
    expect(screen.getByRole('button', { name: '按住说话' })).toBe(mic);
    expect(container.querySelector('.transcript-stage')).toBe(stage);
    expect(container.querySelector('.voice-panel')).toHaveAttribute('data-phase', phase);
    expect(container.querySelectorAll('.voice-panel > .voice-controls')).toHaveLength(1);
    expect(container.querySelectorAll('.voice-panel > .continue-hint')).toHaveLength(1);
  }
  expect(screen.getByRole('button', { name: '修改待确认转写' })).toHaveTextContent('第三行。');
  expect(screen.getByRole('status')).toHaveTextContent('网络连接已中断');
});

it('uses actual volume levels and preserves pending text when recognition fails', () => {
  const { container } = render(<Harness />);
  emit({ phase: 'recording', text: '这一段已经识别到了。', elapsed: 9, level: .5 });
  expect(screen.getByText('正在聆听 · 9 秒')).toBeVisible();
  const bars = container.querySelectorAll<HTMLElement>('.actual-wave i');
  expect(bars).toHaveLength(12);
  expect(bars[0].style.height).not.toBe(bars[1].style.height);
  emit({ phase: 'finishing', text: '这一段已经识别到了。' });
  expect(screen.getByText('确认中…')).toBeVisible();
  expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument();
  emit({ phase: 'error', text: '这一段已经识别到了。', message: '连接中断，已收到的文字已保留' });
  expect(screen.getByRole('status')).toHaveTextContent('连接中断，已收到的文字已保留');
  expect(screen.getByRole('button', { name: '修改待确认转写' })).toHaveTextContent('这一段已经识别到了。');
  expect(screen.getByRole('button', { name: '完成' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '清空' }));
  expect(screen.queryByText('这一段已经识别到了。')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('连接中断');
});

it('shows permission and connection failures without hiding the original controls', () => {
  render(<Harness />);
  emit({ phase: 'error', message: '麦克风未获允许，请在浏览器设置中开启权限' });
  expect(screen.getByRole('status')).toHaveTextContent('麦克风未获允许');
  expect(screen.getByRole('button', { name: '按住说话' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument();
});

it('appends dictated words to the editable AI prompt and restores the prefix when cancelled', async () => {
  vi.useFakeTimers();
  localStorage.setItem('suiyue-voice-consent-v1', 'yes');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('AudioContext', class {});
  function DictationHarness() {
    const [value, setValue] = useState('保留原来的要求。');
    return <><textarea aria-label="小文要求" value={value} onChange={event => setValue(event.target.value)} />
      <VoiceDictationButton value={value} onChange={setValue} /></>;
  }
  render(<DictationHarness />);
  const hold = screen.getByRole('button', { name: '按住说话输入要求' });
  fireEvent.keyDown(hold, { key: 'Enter' });
  await act(() => vi.advanceTimersByTimeAsync(180));
  emit({ phase: 'recording', text: '再简短一些。' });
  expect(screen.getByLabelText('小文要求')).toHaveValue('保留原来的要求。再简短一些。');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByLabelText('小文要求')).toHaveValue('保留原来的要求。');
});

it('keeps the compact dictation button held through preparation and ignores pointer blur', async () => {
  vi.useFakeTimers();
  localStorage.setItem('suiyue-voice-consent-v1', 'yes');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('AudioContext', class {});
  render(<VoiceDictationButton value="" onChange={() => {}} />);
  const hold = screen.getByRole('button', { name: '按住说话输入要求' });
  Object.assign(hold, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() });

  fireEvent.pointerDown(hold, { pointerId: 7, pointerType: 'touch', button: 0 });
  expect(hold).toHaveClass('holding');
  expect(hold).toHaveTextContent('请继续按住');
  await act(() => vi.advanceTimersByTimeAsync(180));
  expect(bridge.start).toHaveBeenCalledOnce();

  emit({ phase: 'permission', message: '正在准备麦克风…' });
  fireEvent.blur(hold);
  expect(hold).toHaveClass('holding');
  expect(hold).toHaveTextContent('请继续按住');
  expect(bridge.stop).not.toHaveBeenCalled();

  emit({ phase: 'connecting', message: '正在连接识别服务…' });
  expect(hold).toHaveClass('holding');
  emit({ phase: 'recording' });
  expect(hold).toHaveTextContent('松开结束');

  fireEvent.pointerUp(hold, { pointerId: 7, pointerType: 'touch', button: 0 });
  expect(hold).not.toHaveClass('holding');
  expect(bridge.stop).toHaveBeenCalledOnce();
  emit({ phase: 'finishing', message: '正在确认最后几个字…' });
  expect(hold).toHaveTextContent('正在确认');
});

it('ends keyboard holds on blur and cancels pointer holds only on pointer cancel', async () => {
  vi.useFakeTimers();
  localStorage.setItem('suiyue-voice-consent-v1', 'yes');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('AudioContext', class {});
  render(<VoiceDictationButton value="" onChange={() => {}} />);
  const hold = screen.getByRole('button', { name: '按住说话输入要求' });
  Object.assign(hold, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => false), releasePointerCapture: vi.fn() });

  fireEvent.keyDown(hold, { key: 'Enter' });
  await act(() => vi.advanceTimersByTimeAsync(180));
  fireEvent.blur(hold);
  expect(bridge.stop).toHaveBeenCalledOnce();
  expect(hold).not.toHaveClass('holding');

  fireEvent.pointerDown(hold, { pointerId: 9, pointerType: 'touch', button: 0 });
  await act(() => vi.advanceTimersByTimeAsync(180));
  fireEvent.pointerCancel(hold, { pointerId: 9, pointerType: 'touch' });
  expect(bridge.cancel).toHaveBeenCalledOnce();
  expect(hold).not.toHaveClass('holding');
});
