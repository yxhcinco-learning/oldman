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
    private onChange: (state: SpeechState) => void;
    constructor(onChange: (state: SpeechState) => void) { this.onChange = onChange; bridge.emit = state => { this.state = state; onChange(state); }; }
    start() { bridge.start(); }
    stop() { bridge.stop(); }
    cancel() { bridge.cancel(); this.state = { phase: 'idle', text: '', elapsed: 0, level: 0, message: '' }; this.onChange(this.state); }
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
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
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

it('starts compact dictation on tap and keeps recognized words when tapped again to cancel capture', () => {
  localStorage.setItem('suiyue-voice-consent-v1', 'yes');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('AudioContext', class {});
  function DictationHarness() {
    const [value, setValue] = useState('保留原来的要求。');
    return <><textarea aria-label="小文要求" value={value} onChange={event => setValue(event.target.value)} />
      <VoiceDictationButton value={value} onChange={setValue} /></>;
  }
  render(<DictationHarness />);
  const toggle = screen.getByRole('button', { name: '点按开始语音输入要求' });
  fireEvent.click(toggle);
  expect(bridge.start).toHaveBeenCalledOnce();
  emit({ phase: 'recording', text: '再简短一些。' });
  expect(screen.getByLabelText('小文要求')).toHaveValue('保留原来的要求。再简短一些。');
  expect(screen.getByRole('button', { name: '取消语音输入要求' })).toHaveClass('active');
  fireEvent.click(screen.getByRole('button', { name: '取消语音输入要求' }));
  expect(bridge.cancel).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('小文要求')).toHaveValue('保留原来的要求。再简短一些。');
  expect(screen.getByRole('button', { name: '点按开始语音输入要求' })).not.toHaveClass('active');
});

it('keeps tap dictation active through preparation and does not treat blur as completion', () => {
  localStorage.setItem('suiyue-voice-consent-v1', 'yes');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('AudioContext', class {});
  render(<VoiceDictationButton value="" onChange={() => {}} />);
  const toggle = screen.getByRole('button', { name: '点按开始语音输入要求' });
  fireEvent.click(toggle);
  expect(bridge.start).toHaveBeenCalledOnce();

  emit({ phase: 'permission', message: '正在准备麦克风…' });
  fireEvent.blur(toggle);
  expect(screen.getByRole('button', { name: '取消语音输入要求' })).toHaveClass('active');
  expect(bridge.stop).not.toHaveBeenCalled();
  expect(bridge.cancel).not.toHaveBeenCalled();

  emit({ phase: 'connecting', message: '正在连接识别服务…' });
  expect(screen.getByRole('button', { name: '取消语音输入要求' })).toHaveClass('active');
  emit({ phase: 'recording' });
  fireEvent.click(screen.getByRole('button', { name: '取消语音输入要求' }));
  expect(bridge.cancel).toHaveBeenCalledOnce();
  expect(bridge.stop).not.toHaveBeenCalled();
});

it('restores the pre-dictation value when tap dictation is cancelled with Escape', () => {
  localStorage.setItem('suiyue-voice-consent-v1', 'yes');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('AudioContext', class {});
  function DictationHarness() {
    const [value, setValue] = useState('原有文字。');
    return <><span>{value}</span><VoiceDictationButton value={value} onChange={setValue} /></>;
  }
  render(<DictationHarness />);
  fireEvent.click(screen.getByRole('button', { name: '点按开始语音输入要求' }));
  emit({ phase: 'recording', text: '临时识别。' });
  expect(screen.getByText('原有文字。临时识别。')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(bridge.cancel).toHaveBeenCalledOnce();
  expect(screen.getByText('原有文字。')).toBeInTheDocument();
});
