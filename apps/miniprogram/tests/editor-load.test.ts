import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, newSession, startInterview, type Draft, type ArticleSession } from '../miniprogram/domain/core';

const services = vi.hoisted(() => ({
  repository: { load: vi.fn() }, writer: { seed: vi.fn(), preserve: vi.fn() },
  conversations: { read: () => ({ composer: '', requestStatus: 'idle', error: '' }) },
}));
vi.mock('../miniprogram/services', () => ({ miniServices: () => services }));
vi.mock('../miniprogram/ui/navigation', () => ({ navigationMetrics: () => ({}) }));

interface EditorPage {
  data: { draft: Draft | null; body: string; error: string; revision: number; session: ArticleSession | null; navigationSaving: boolean };
  open(id?: string): Promise<void>;
  openXiaoWen(): Promise<void>;
  onBodyInput(event: { detail: { value: string } }): void;
  scheduleSave(): void;
  setData(value: Record<string, unknown>): void;
  syncXiaoWen(): void;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function navigationPage() {
  vi.resetModules();
  let definition!: EditorPage;
  vi.stubGlobal('Page', (page: EditorPage) => { definition = page; });
  await import('../miniprogram/pages/editor/index');
  const draft = { ...emptyDraft(), inputMode: 'text' as const, textDraft: '未保存正文' };
  return { ...definition, data: { ...definition.data, draft, body: draft.textDraft, session: startInterview(newSession(draft), draft, 'start') },
    setData(value: Record<string, unknown>) { Object.assign(this.data, value); }, scheduleSave() {} };
}

describe('小程序编辑器读取与展示失败隔离', () => {
  it('跨页保存失败保留原页正文，重试成功才跳转', async () => {
    const redirectTo = vi.fn().mockResolvedValue({});
    vi.stubGlobal('wx', { redirectTo });
    services.writer.preserve.mockRejectedValueOnce(new Error('本机空间不足')).mockResolvedValue(undefined);
    const page = await navigationPage();
    await page.openXiaoWen();
    expect(redirectTo).not.toHaveBeenCalled();
    expect(page.data).toMatchObject({ body: '未保存正文', error: '本机空间不足', navigationSaving: false });
    await page.openXiaoWen();
    expect(redirectTo).toHaveBeenCalledOnce();
  });
  it('跨页保存中拒绝重复打开，期间新输入不会被旧保存覆盖或带走', async () => {
    const redirectTo = vi.fn();
    vi.stubGlobal('wx', { redirectTo });
    let release!: () => void;
    services.writer.preserve.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const page = await navigationPage();
    const opening = page.openXiaoWen();
    await page.openXiaoWen();
    page.onBodyInput({ detail: { value: '更新的正文' } });
    release(); await opening;
    expect(services.writer.preserve).toHaveBeenCalledOnce();
    expect(redirectTo).not.toHaveBeenCalled();
    expect(page.data.body).toBe('更新的正文');
  });
  it('展示共享会话抛错时保留已加载作品，而不替换为空草稿', async () => {
    vi.resetModules();
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
