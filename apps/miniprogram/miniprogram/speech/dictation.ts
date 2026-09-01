import { articleText, effectiveSegments, type Draft } from '../domain/core';

export interface DictationAppendResult {
  value: string;
  accepted: string;
  truncated: boolean;
}

/** Dictation is user input only. The caller decides whether it belongs in a body or an unsent composer. */
export function appendDictation(existing: string, dictated: string, maxLength: number, separator: string): DictationAppendResult {
  const text = dictated.trim();
  if (!text || maxLength < 1) return { value: existing, accepted: '', truncated: false };
  const joiner = existing.trim() ? separator : '';
  const room = Math.max(0, maxLength - existing.length - joiner.length);
  const accepted = text.slice(0, room);
  return { value: accepted ? existing + joiner + accepted : existing, accepted, truncated: accepted.length < text.length };
}

export interface PendingBodyDictationResult extends DictationAppendResult {
  draft: Draft;
}

/** Body dictation is staged for explicit review; it must never mutate article segments directly. */
export function stageBodyDictation(draft: Draft, dictated: string, maxLength = 12_000): PendingBodyDictationResult {
  const bodyLength = articleText(effectiveSegments(draft)).length;
  const result = appendDictation(draft.pendingVoice, dictated, Math.max(0, maxLength - bodyLength), draft.pendingVoice.trim() ? ' ' : '');
  return { ...result, draft: result.accepted ? { ...draft, pendingVoice: result.value } : draft };
}
