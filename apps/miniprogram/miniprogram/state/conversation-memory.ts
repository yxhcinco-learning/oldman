export type ComposerInputSource = 'typed' | 'dictated';
export type ConversationRequestStatus = 'idle' | 'blocked';

export interface ConversationMemoryState {
  composer: string;
  inputSource: ComposerInputSource;
  requestStatus: ConversationRequestStatus;
  error: string;
}

const emptyState = (): ConversationMemoryState => ({ composer: '', inputSource: 'typed', requestStatus: 'idle', error: '' });

/** Request errors remain transient; composer text is also persisted by the draft writer. */
export class ConversationMemory {
  private readonly states = new Map<string, ConversationMemoryState>();
  constructor(private readonly changed?: (id: string, state: Pick<ConversationMemoryState, 'composer' | 'inputSource'>) => void) {}
  hydrate(workId: string, state: Pick<ConversationMemoryState, 'composer' | 'inputSource'>) {
    this.states.set(workId, { ...emptyState(), ...state });
    this.changed?.(workId, state);
  }

  read(workId: string): ConversationMemoryState {
    return { ...(this.states.get(workId) ?? emptyState()) };
  }

  updateComposer(workId: string, composer: string, inputSource: ComposerInputSource = 'typed') {
    const current = this.read(workId);
    this.states.set(workId, { ...current, composer, inputSource, requestStatus: 'idle', error: '' });
    this.changed?.(workId, { composer, inputSource });
  }

  markBlocked(workId: string, error: string) {
    const current = this.read(workId);
    this.states.set(workId, { ...current, requestStatus: 'blocked', error });
  }

  clearComposer(workId: string) {
    const current = this.read(workId);
    this.states.set(workId, { ...current, composer: '', inputSource: 'typed', requestStatus: 'idle', error: '' });
    this.changed?.(workId, { composer: '', inputSource: 'typed' });
  }

  clear(workId: string) {
    this.states.delete(workId);
  }
}
