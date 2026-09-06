import { afterEach, describe, expect, it, vi } from 'vitest';

const current = vi.hoisted(() => ({ services: {} as object }));
vi.mock('../miniprogram/services', () => ({ miniServices: () => current.services }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({}) }));

interface PageDefinition {
  data: Record<string, unknown>;
  onLoad(options: Record<string, string>): void;
  setData(value: Record<string, unknown>): void;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('更换账号清空整个旧页面，迟到结果不能重新显示', () => {
  it.each(['editor', 'interview'])('%s 连同标题抽屉、候选摘要和转写展示一起隐藏', async name => {
    vi.resetModules();
    let definition!: PageDefinition;
    let accountChanged!: () => void;
    const subscribe = () => () => {};
    current.services = { sync: { subscribe, beforeSync: subscribe },
      account: { subscribe: (listener: () => void) => { accountChanged = listener; return () => {}; } },
      articleAi: { subscribe }, speech: { subscribe } };
    vi.stubGlobal('wx', { getWindowInfo: () => ({ windowHeight: 640 }) });
    vi.stubGlobal('Page', (value: PageDefinition) => { definition = value; });
    if (name === 'editor') await import('../miniprogram/pages/editor/index');
    else await import('../miniprogram/pages/interview/index');
    let preserved: string | undefined;
    const page = { ...definition, data: structuredClone(definition.data), open: vi.fn(), refreshCloudState: vi.fn(),
      setData(value: Record<string, unknown>) { Object.assign(this.data, value); },
      flushAutoSave: async () => { preserved = JSON.stringify(page.data); return true; },
      saveComposer: async () => { preserved = JSON.stringify(page.data); return true; } };
    page.onLoad({});
    // Fill every text-bearing field, including fields in currently hidden drawers.
    for (const [key, value] of Object.entries(page.data)) if (typeof value === 'string') page.setData({ [key]: '私密内容' });
    page.setData({ draft: { id: 'old-work', title: '私密标题' }, titleDialog: true, pendingDialog: true });
    current.services = {};
    accountChanged();
    expect(preserved).toContain('私密内容');
    expect(JSON.stringify(page.data)).not.toContain('私密');
    expect(page.data).toMatchObject({ draft: null, readOnly: true });
    page.setData({ voiceText: '迟到私密转写', body: '迟到私密正文' });
    expect(JSON.stringify(page.data)).not.toContain('私密');
  });
});
