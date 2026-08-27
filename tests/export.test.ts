import { afterEach, expect, it, vi } from 'vitest';
import { download, exportText } from '../lib/domain/download';
import { emptyDraft } from '../lib/domain/writing';

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
