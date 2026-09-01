import { describe, expect, it } from 'vitest';
import { resolveKeyboardInset } from '../miniprogram/ui/keyboard';

describe('小程序键盘避让', () => {
  it('窗口已经缩小时不重复上推弹层', () => {
    expect(resolveKeyboardInset(300, 932, 632, 3)).toBe(0);
  });

  it('窗口没有缩小时补偿完整键盘高度', () => {
    expect(resolveKeyboardInset(300, 932, 932, 3)).toBe(300);
  });

  it('只补偿窗口尚未覆盖的部分并兼容物理像素上报', () => {
    expect(resolveKeyboardInset(300, 932, 732, 3)).toBe(100);
    expect(resolveKeyboardInset(1200, 932, 932, 3)).toBe(400);
  });
});
