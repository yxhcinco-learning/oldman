import { afterEach, expect, it, vi } from 'vitest';
import { download, exportText } from '../lib/domain/download';
import { emptyDraft } from '../lib/domain/writing';
import { AI_ASSISTANCE_DISCLOSURE, newSession, newVersion } from '../lib/domain/article-ai';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('exports title, poem line breaks and unfinished content without silently losing it', () => {
  const blobs: BlobPart[][] = [];
  vi.stubGlobal('Blob', class { constructor(parts: BlobPart[]) { blobs.push(parts); } });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const draft = { ...emptyDraft(), title: '夏日/有感', inputMode: 'text' as const, textDraft: '窗前的雨\n落在纸上', pendingVoice: '待确认文字', segmentEdit: { id: 'pending', text: '修改中的文字' } };
  exportText(draft);
  expect(blobs[0][0]).toBe('夏日/有感\n\n窗前的雨\n落在纸上\n\n【待确认的语音】\n待确认文字\n\n【尚在编辑的内容】\n修改中的文字');
  expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('夏日_有感.txt'); expect(document.querySelector('a')).toBeNull();
});
it('releases download URLs after dispatch', () => {
  vi.useFakeTimers(); const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  download('backup.json', '{}', 'application/json'); vi.advanceTimersByTime(1000); expect(revoke).toHaveBeenCalledWith('blob:test');
});

it('adds a visible AI disclosure to an exported article only after a candidate was applied', () => {
  const blobs: BlobPart[][] = [];
  vi.stubGlobal('Blob', class { constructor(parts: BlobPart[]) { blobs.push(parts); } });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const draft = { ...emptyDraft(), title: '整理后的文章', inputMode: 'text' as const, textDraft: '候选正文' };
  const session = newSession({ ...draft, textDraft: '原文' });
  const version = newVersion(draft, 'rewrite');
  session.versions.push(version);
  session.turns.push({ id: 'applied', createdAt: new Date().toISOString(), action: 'chat', prompt: '整理', inputVersionId: session.versions[0].id,
    status: 'applied', appliedVersionId: version.id, result: { answer: '已整理', body: '候选正文', citedVersionIds: [] } });
  exportText(draft, session);
  expect(blobs[0][0]).toContain(AI_ASSISTANCE_DISCLOSURE);
  expect(blobs[0][0]).toContain('候选正文');
});
