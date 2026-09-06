import { afterEach, expect, it, vi } from 'vitest';
import { measureTopic } from '../miniprogram/ui/topic-motion';
afterEach(() => vi.unstubAllGlobals());
it.each([[300, 100, 0], [200, 400, 200]])('主题宽度%s文字宽度%s仅溢出时滚动', (width, textWidth, distance) => {
  vi.stubGlobal('wx', { nextTick: (fn: () => void) => fn() });
  const query = { select: () => query, boundingClientRect: () => query, exec: (fn: (r: unknown) => void) => fn([{ width }, { width: textWidth }]) };
  const page = { createSelectorQuery: () => query, setData: vi.fn() };
  measureTopic(page as unknown as Parameters<typeof measureTopic>[0]);
  expect(page.setData).toHaveBeenCalledWith({ topicDistance: distance, topicDuration: Math.max(7, distance / 16 + 3) });
});
