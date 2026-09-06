import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, type Draft } from '../miniprogram/domain/core';

const services = vi.hoisted(() => ({
  repository: { load: vi.fn() }, writer: { seed: vi.fn() },
  conversations: { read: () => ({ composer: '', requestStatus: 'idle', error: '' }) },
}));
vi.mock('../miniprogram/services', () => ({ miniServices: () => services }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({}) }));

interface EditorPage {
  data: { draft: Draft | null; body: string; error: string; revision: number };
  open(id?: string): Promise<void>;
  setData(value: Record<string, unknown>): void;
  syncXiaoWen(): void;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('小程序编辑器读取与展示失败隔离', () => {
  it('展示共享会话抛错时保留已加载作品，而不替换为空草稿', async () => {
    const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '必须保留的本机正文' };
    services.repository.load.mockResolvedValue({ works: [{ id: draft.id, draft, revision: 7 }],
      recovery: null, sessions: [], issues: [] });
    let definition!: EditorPage;
    vi.stubGlobal('Page', (page: EditorPage) => { definition = page; });
    await import('../miniprogram/pages/editor/index');
    const page = { ...definition, data: { ...definition.data },
      setData(value: Record<string, unknown>) { Object.assign(this.data, value); },
      syncXiaoWen() { throw new Error('conversationView is not a function'); } };
    await page.open(draft.id);
    expect(page.data).toMatchObject({ draft, body: '必须保留的本机正文', revision: 7, error: 'conversationView is not a function' });
    expect(services.writer.seed).toHaveBeenCalledExactlyOnceWith(draft.id, 7);
  });
});
