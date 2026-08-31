export type SpeechEvent = { type: 'ready' } | { type: 'transcript'; text: string; final: boolean } | { type: 'done' } | { type: 'limit' } | { type: 'error'; message: string };
export class TranscriptAccumulator {
  private sentences = new Map<number, { text: string; final: boolean }>();
  accept(index: number, text: string, final: boolean) {
    const old = this.sentences.get(index);
    if (!old?.final || final) this.sentences.set(index, { text, final });
    return this.text;
  }
  get text() { return [...this.sentences.entries()].sort(([a], [b]) => a - b).map(([, s]) => s.text).join(''); }
}
