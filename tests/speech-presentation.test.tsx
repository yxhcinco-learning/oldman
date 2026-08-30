import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SpeechState } from '../features/speech/session';
import { VoiceDictationButton } from '../features/speech/VoiceDictationButton';
import { VoicePanel } from '../features/speech/VoicePanel';

// Presentation-only events: no capture, sockets or paid recognition are used.
const bridge = vi.hoisted(() => ({ emit: undefined as undefined | ((state: SpeechState) => void) }));
vi.mock('../features/speech/session', () => ({
  SpeechSession: class {
    state = { phase: 'idle', text: '', elapsed: 0, level: 0, message: '' } as SpeechState;
    constructor(onChange: (state: SpeechState) => void) { bridge.emit = state => { this.state = state; onChange(state); }; }
    start() {}
    stop() {}
    cancel() {}
  },
}));
function Harness() {
  const [pending, setPending] = useState('');
  return <VoicePanel pending={pending} onPending={setPending} onEdit={() => {}} onDone={() => {}} />;
}
function emit(next: Partial<SpeechState>) {
  act(() => bridge.emit?.({ phase: 'idle', text: '', elapsed: 0, level: 0, message: '', ...next }));
}

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
