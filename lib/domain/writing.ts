export interface Segment { id: string; text: string }
export type InputMode = 'voice' | 'text';
export interface Draft {
  id: string;
  title: string;
  segments: Segment[];
  textDraft: string;
  inputMode: InputMode;
  pendingVoice: string;
  segmentEdit: { id: string; text: string } | null;
}
export interface Work {
  id: string;
  title: string;
  segments: Segment[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
  draft: Draft;
}
export interface Recovery { draft: Draft; revision: number }
export const newId = () => crypto.randomUUID();
export const articleText = (segments: Segment[]) => segments.map(s => s.text).join('\n\n');
export const countWords = (segments: Segment[]) => [...articleText(segments).replace(/\s/g, '')].length;

export function splitDraft(text: string, previous: Segment[] = []): Segment[] {
  return text.split(/\n\s*\n/).filter(p => p.trim()).map((p, i) => ({
    id: previous[i]?.id ?? newId(), text: p,
  }));
}
export function emptyDraft(): Draft {
  return { id: newId(), title: '', segments: [], textDraft: '', inputMode: 'voice', pendingVoice: '', segmentEdit: null };
}
export function effectiveSegments(draft: Draft) {
  return draft.inputMode === 'text' ? splitDraft(draft.textDraft, draft.segments) : draft.segments;
}
export function hasContent(draft: Draft) {
  return Boolean(draft.title.trim() || articleText(effectiveSegments(draft)).trim() || draft.pendingVoice.trim() || draft.segmentEdit?.text.trim());
}
export function workFromDraft(draft: Draft, existing?: Work): Work {
  const now = new Date().toISOString();
  const segments = effectiveSegments(draft);
  return { id: draft.id, title: draft.title.trim() || '未命名作品', segments,
    createdAt: existing?.createdAt ?? now, updatedAt: now, revision: (existing?.revision ?? 0) + 1,
    deletedAt: null, draft: structuredClone({ ...draft, segments }) };
}
export function completeSegment(draft: Draft): Draft {
  const edit = draft.segmentEdit;
  if (!edit) return draft;
  if (edit.id === 'pending') return { ...draft, pendingVoice: edit.text, segmentEdit: null };
  const segments = draft.segments.flatMap(s => s.id !== edit.id ? [s] : edit.text.trim() ? [{ ...s, text: edit.text }] : []);
  return { ...draft, segments, textDraft: articleText(segments), segmentEdit: null };
}
export function completeVoice(draft: Draft): Draft {
  if (!draft.pendingVoice.trim()) return draft;
  const segments = [...effectiveSegments(draft), { id: newId(), text: draft.pendingVoice.trim() }];
  return { ...draft, segments, textDraft: articleText(segments), pendingVoice: '' };
}
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
