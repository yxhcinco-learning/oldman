import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import DesignPreview from '../previews/echoes-of-time/Preview';

function click(name: string | RegExp) { fireEvent.click(screen.getByRole('button', { name })); }
function advance(ms: number) { act(() => { vi.advanceTimersByTime(ms); }); }
function microphone() { return screen.getByRole('button', { name: '按住说话' }); }
function hold(ms = 3000) {
  fireEvent.pointerDown(microphone(), { pointerId: 1, button: 0, pointerType: 'mouse' });
  advance(ms);
  fireEvent.pointerUp(microphone(), { pointerId: 1 });
}
function openTrain() { render(<DesignPreview />); click(/^第一次坐绿皮火车/); }

beforeEach(() => {
  vi.useFakeTimers();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('isolated Echoes design preview', () => {
  it('starts with the original three works and keeps edited works only in memory', () => {
    const { unmount } = render(<DesignPreview />);
    expect(screen.getByText('3 篇作品')).toBeVisible();
    click('开始写作');
    fireEvent.change(screen.getByLabelText('文章标题'), { target: { value: '夏日小诗' } });
    fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
    const body = screen.getByLabelText('文章正文');
    expect(body).toHaveFocus();
    fireEvent.change(body, { target: { value: '窗前的雨\n落进风里。' } });
    click('保存');
    expect(screen.getByText('4 篇作品')).toBeVisible();
    click(/^夏日小诗/);
    expect(screen.getByRole('button', { name: '编辑第1段：窗前的雨' })).toBeVisible();
    expect(screen.getByRole('button', { name: '编辑第2段：落进风里。' })).toBeVisible();
    unmount();
    render(<DesignPreview />);
    expect(screen.getByText('3 篇作品')).toBeVisible();
    expect(screen.queryByText('夏日小诗')).not.toBeInTheDocument();
  });

  it('requires 180ms for pointer input and cancels without appending a paragraph', () => {
    render(<DesignPreview />); click('开始写作');
    fireEvent.pointerDown(microphone(), { pointerId: 1 });
    advance(179);
    expect(screen.queryByText(/正在聆听/)).not.toBeInTheDocument();
    fireEvent.pointerUp(microphone(), { pointerId: 1 });
    expect(screen.getByText('请按住按钮，再开始说话')).toBeVisible();
    fireEvent.pointerDown(microphone(), { pointerId: 1 });
    advance(180);
    expect(screen.getByText(/正在聆听/)).toBeVisible();
    advance(1000);
    fireEvent.pointerCancel(microphone(), { pointerId: 1 });
    advance(3000);
    expect(screen.getByText('从想说的一句话开始……')).toBeVisible();
    expect(screen.queryByRole('button', { name: '编辑刚刚说的内容' })).not.toBeInTheDocument();
  });

  it('allows continued voice input, pending edits, confirmation and clearing', () => {
    render(<DesignPreview />); click('开始写作');
    hold();
    const first = screen.getByRole('button', { name: '编辑刚刚说的内容' }).textContent ?? '';
    expect(first).toContain('我十六岁那年');
    hold();
    expect(screen.getByRole('button', { name: '编辑刚刚说的内容' }).textContent?.length).toBeGreaterThan(first.length);
    click('编辑刚刚说的内容');
    fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '这是修改后的语音。' } });
    click('完成修改');
    click('完成');
    click('编辑第1段：这是修改后的语音。');
    fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: '' } });
    click('完成修改');
    expect(screen.getByText('从想说的一句话开始……')).toBeVisible();
    hold(); click('清空');
    expect(screen.queryByRole('button', { name: '编辑刚刚说的内容' })).not.toBeInTheDocument();
  });

  it('supports keyboard recording and the visible mock keyboard', () => {
    render(<DesignPreview />); click('开始写作');
    fireEvent.keyDown(microphone(), { key: ' ' }); advance(800);
    fireEvent.keyUp(microphone(), { key: ' ' }); click('完成');
    fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
    const before = (screen.getByLabelText('文章正文') as HTMLTextAreaElement).value;
    click('我'); click('换行'); click('我是');
    expect(screen.getByLabelText('文章正文')).toHaveValue(`${before}我\n我是`);
    click('删除');
    expect(screen.getByLabelText('文章正文')).toHaveValue(`${before}我\n我`);
    fireEvent.click(screen.getByRole('tab', { name: '语音输入' }));
    expect(screen.getAllByRole('button', { name: /^编辑第/ })).toHaveLength(2);
  });

  it('keeps empty chat harmless and organizes mock replies on completion', () => {
    render(<DesignPreview />); click('开始写作'); click('聊天引导');
    expect(screen.getByText(/您今天最想写起/)).toBeVisible();
    click('完成');
    expect(screen.getByText('从想说的一句话开始……')).toBeVisible();
    click('聊天引导'); hold(); advance(1000);
    expect(screen.getByText(/陈阿姨您好/)).toBeVisible();
    click('完成');
    expect(screen.getByRole('button', { name: /^编辑第1段：那一年我叫陈桂芳/ })).toBeVisible();
  });

  it.each([
    ['内容类型', '生活随笔'], ['文风调整', '温暖叙事'], ['格式整理', '自动分段'],
  ])('previews %s, applies to the draft and allows one undo', (category, choice) => {
    openTrain();
    const initial = screen.getByRole('button', { name: /^编辑第1段/ }).textContent;
    click('文章优化'); click(new RegExp(`^${category}`)); click(new RegExp(`^${choice}`));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('看看优化后的样子');
    click('应用优化');
    expect(screen.getByRole('button', { name: /^编辑第1段/ }).textContent).not.toBe(initial);
    click('撤销');
    expect(screen.getByRole('button', { name: /^编辑第1段/ }).textContent).toBe(initial);
    expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
  });

  it('adds an illustration from text mode, displays it and undoes the addition', () => {
    openTrain();
    fireEvent.click(screen.getByRole('tab', { name: '文字输入' }));
    click('文章优化'); click(/^AI 配图/); click(/北去的列车/); click('应用优化');
    expect(screen.getByRole('figure', { name: '文章配图：北去的列车' })).toBeVisible();
    click('撤销');
    expect(screen.queryByRole('figure', { name: '文章配图：北去的列车' })).not.toBeInTheDocument();
  });

  it('accepts custom requirements and traps/restores modal focus', () => {
    openTrain();
    const launcher = screen.getByRole('button', { name: '文章优化' }); launcher.focus();
    click('文章优化');
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByRole('button', { name: '关闭' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(within(modal).getByRole('button', { name: /^其他要求/ })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(launcher).toHaveFocus();
    click('文章优化'); click(/^其他要求/);
    expect(screen.getByRole('button', { name: '让小文试着改改' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('自定义优化要求'), { target: { value: '请保留口语感' } });
    click('让小文试着改改'); expect(screen.getByText('请保留口语感')).toBeVisible();
    click('先不修改');
    expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
  });

  it('does not access storage, network or microphone APIs', () => {
    const fetchSpy = vi.spyOn(window, 'fetch');
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const dbSpy = vi.spyOn(indexedDB, 'open');
    render(<DesignPreview />); click('开始写作'); hold(); click('完成');
    click('聊天引导'); hold(); advance(1000); click('完成'); click('保存');
    expect(fetchSpy).not.toHaveBeenCalled(); expect(storageSpy).not.toHaveBeenCalled(); expect(dbSpy).not.toHaveBeenCalled();
    const source = readFileSync('previews/echoes-of-time/Preview.tsx', 'utf8');
    expect(source).not.toMatch(/getUserMedia|SpeechRecognition|localStorage|indexedDB|lib\/storage|features\/|server\//);
    const server = readFileSync('previews/echoes-of-time/serve.mjs', 'utf8');
    expect(server).toContain('envDir: false');
    expect(server).toContain("server.listen(3004, '127.0.0.1'");
    expect(server).toContain("pathname !== '/'");
    expect(server).toContain("connect-src 'none'");
  });
});
