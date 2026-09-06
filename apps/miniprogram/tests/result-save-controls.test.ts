import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, newSession } from '../miniprogram/domain/core';

const serviceAccess = vi.hoisted(() => vi.fn());
vi.mock('../miniprogram/services', () => ({ miniServices: serviceAccess }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({}) }));

interface PageDefinition {
  data: Record<string, unknown>;
  currentDraft(): ReturnType<typeof emptyDraft>;
  runXiaoWen(action: 'dialogue', prompt: string): Promise<void>;
  startInterview(): Promise<void>;
  pressXiaoWenVoice(): void;
  runDialogue(prompt: string): Promise<void>;
  toggleInterview(): Promise<void>;
  continueInterview(): Promise<void>;
  pressDictation(): void;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('收到回复待保存时的页面操作锁', () => {
  it.each(['editor', 'interview'])('%s 的事件入口不只依赖按钮视觉禁用', async kind => {
    vi.resetModules();
    let definition!: PageDefinition;
    vi.stubGlobal('Page', (page: PageDefinition) => { definition = page; });
    if (kind === 'editor') await import('../miniprogram/pages/editor/index');
    else await import('../miniprogram/pages/interview/index');
    const draft = emptyDraft();
    const setData = vi.fn();
    const page = { ...definition, data: { ...definition.data, draft, body: '', session: newSession(draft), resultSavePending: true }, setData };
    if (kind === 'editor') {
      await page.runXiaoWen('dialogue', '再次发送');
      await page.startInterview();
      page.pressXiaoWenVoice();
    } else {
      await page.runDialogue('再次发送');
      await page.toggleInterview();
      await page.continueInterview();
      page.pressDictation();
    }
    expect(serviceAccess).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
  });
});
