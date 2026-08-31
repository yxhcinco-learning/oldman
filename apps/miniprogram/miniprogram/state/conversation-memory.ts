export type ComposerInputSource = 'typed' | 'dictated';
export type ConversationRequestStatus = 'idle' | 'blocked';

export interface ConversationMemoryState {
  composer: string;
  inputSource: ComposerInputSource;
  requestStatus: ConversationRequestStatus;
  error: string;
}

const emptyState = (): ConversationMemoryState => ({ composer: '', inputSource: 'typed', requestStatus: 'idle', error: '' });

/** Page-routing memory only. This state is deliberately excluded from works and backups. */
export class ConversationMemory {
  private readonly states = new Map<string, ConversationMemoryState>();

  read(workId: string): ConversationMemoryState {
    return { ...(this.states.get(workId) ?? emptyState()) };
  }

  updateComposer(workId: string, composer: string, inputSource: ComposerInputSource = 'typed') {
    const current = this.read(workId);
    this.states.set(workId, { ...current, composer, inputSource, requestStatus: 'idle', error: '' });
  }

  markBlocked(workId: string, error: string) {
    const current = this.read(workId);
    this.states.set(workId, { ...current, requestStatus: 'blocked', error });
  }

  clearComposer(workId: string) {
    const current = this.read(workId);
    this.states.set(workId, { ...current, composer: '', inputSource: 'typed', requestStatus: 'idle', error: '' });
  }

  clear(workId: string) {
    this.states.delete(workId);
  }
}
