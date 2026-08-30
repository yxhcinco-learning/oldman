export type DOMPointCaret = { offsetNode: Node; offset: number };

type PointCaretDocument = {
  caretPositionFromPoint?: (x: number, y: number) => DOMPointCaret | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

export function caretFromPoint(ownerDocument: Document, clientX: number, clientY: number): DOMPointCaret | null {
  const pointDocument = ownerDocument as unknown as PointCaretDocument;
  const position = pointDocument.caretPositionFromPoint?.(clientX, clientY);
  if (position) return position;
  const range = pointDocument.caretRangeFromPoint?.(clientX, clientY);
  return range ? { offsetNode: range.startContainer, offset: range.startOffset } : null;
}

export function textOffsetAtCaret(root: HTMLElement, caret: DOMPointCaret | null): number | null {
  if (!caret || (caret.offsetNode !== root && !root.contains(caret.offsetNode))) return null;
  try {
    const range = root.ownerDocument.createRange();
    range.setStart(root, 0);
    range.setEnd(caret.offsetNode, caret.offset);
    return Math.min(range.toString().length, root.textContent?.length ?? 0);
  } catch {
    return null;
  }
}

export function textOffsetFromPoint(root: HTMLElement, clientX: number, clientY: number) {
  return textOffsetAtCaret(root, caretFromPoint(root.ownerDocument, clientX, clientY)) ?? (root.textContent?.length ?? 0);
}
