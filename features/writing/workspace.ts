import { emptyDraft, hasContent, splitDraft, type Draft, type Work } from '../../lib/domain/writing';
import { DraftWriter, type WorkRepository } from '../../lib/storage/repository';
import { checkpointSession, documentOf, newSession, newVersion, recoverSession, sameDocument, type ArticleSession } from '../../lib/domain/article-ai';

export interface WorkspaceState {
  loading: boolean; works: Work[]; draft: Draft | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'; error: string | null;
  sessions: ArticleSession[];
}
const message = (error: unknown) => error instanceof Error ? error.message : '本机保存暂时不可用，请导出备份';
export class Workspace {
  state: WorkspaceState = { loading: true, works: [], draft: null, saveStatus: 'idle', error: null, sessions: [] };
  private listeners = new Set<() => void>();
  private writer: DraftWriter;
  private initPromise?: Promise<void>;
  private serial = 0;
  private checkpointTimer?: ReturnType<typeof setTimeout>;
  private dirtySessions = new Set<string>();
  constructor(private repository: WorkRepository) { this.writer = new DraftWriter(repository); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(next: Partial<WorkspaceState>) { this.state = { ...this.state, ...next }; this.listeners.forEach(fn => fn()); }
  initialize() {
    this.initPromise ??= this.repository.load().then(({ works, recovery, sessions = [] }) => {
      works.forEach(w => this.writer.seed(w.id, w.revision));
      if (recovery) this.writer.seed(recovery.draft.id, recovery.revision);
      this.patch({ loading: false, works, sessions: sessions.map(recoverSession), draft: recovery?.draft ?? null, saveStatus: recovery ? 'saved' : 'idle' });
    }).catch(error => this.patch({ loading: false, error: message(error), saveStatus: 'error' }));
    return this.initPromise;
  }
  async newWork() { const draft = emptyDraft(); this.writer.seed(draft.id, 0); await this.update(draft); }
  async open(work: Work) { this.writer.seed(work.id, work.revision); await this.update(structuredClone(work.draft)); }
  getSession(id = this.state.draft?.id) { return this.state.sessions.find(session => session.workId === id); }
  dispose() { clearTimeout(this.checkpointTimer); }
  update(draft: Draft): Promise<boolean> {
    clearTimeout(this.checkpointTimer);
    const previous = this.state.draft?.id === draft.id ? this.state.draft : draft;
    let session = this.getSession(draft.id);
    const hadSession = Boolean(session);
    if (!session && hasContent(draft)) session = newSession(previous);
    const completedInput = previous.segmentEdit && !draft.segmentEdit || previous.pendingVoice && !draft.pendingVoice;
    if (session && completedInput) session = checkpointSession(session, draft);
    if (this.listeners.size) this.checkpointTimer = setTimeout(() => { void this.checkpoint(); }, 1200);
    return this.persist(draft, !hadSession || completedInput ? session : undefined);
  }
  private persist(draft: Draft, session?: ArticleSession): Promise<boolean> {
    session ??= this.dirtySessions.has(draft.id) ? this.getSession(draft.id) : undefined;
    if (session) this.dirtySessions.add(draft.id);
    const serial = ++this.serial;
    this.patch({ draft, saveStatus: 'saving', error: null, ...(session ? { sessions: this.state.sessions.filter(s => s.workId !== draft.id).concat(session) } : {}) });
    const savedSession = session;
    return this.writer.write(draft, session).then(work => {
      if (savedSession && this.getSession(draft.id) === savedSession) this.dirtySessions.delete(draft.id);
      const works = work ? [...this.state.works.filter(w => w.id !== work.id), work].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : this.state.works;
      this.patch({ works, ...(serial === this.serial ? { saveStatus: 'saved' as const, error: null } : {}) });
      return true;
    }).catch(error => { if (serial === this.serial) this.patch({ saveStatus: 'error', error: message(error) }); return false; });
  }
  async checkpoint(): Promise<boolean> {
    clearTimeout(this.checkpointTimer);
    const draft = this.state.draft;
    if (!draft) return true;
    const session = this.getSession() ?? (hasContent(draft) ? newSession(draft) : undefined);
    const next = session && checkpointSession(session, draft);
    if (next !== this.getSession() || this.state.saveStatus === 'error' || this.dirtySessions.has(draft.id)) return this.persist(draft, next);
    try { await this.writer.flush(); return true; } catch { return false; }
  }
  updateSession(workId: string, update: (session: ArticleSession) => ArticleSession): Promise<boolean> {
    const draft = this.state.draft;
    const session = this.getSession(workId);
    if (!draft || draft.id !== workId || !session) return Promise.resolve(false);
    return this.persist(draft, update(session));
  }
  async applyTurn(turnId: string): Promise<boolean> {
    if (!await this.checkpoint()) return false;
    const draft = this.state.draft;
    const session = this.getSession();
    const turn = session?.turns.find(t => t.id === turnId);
    const base = session?.versions.find(v => v.id === turn?.inputVersionId);
    if (!draft || !session || !turn || turn.status !== 'ready' || turn.action === 'question' || !turn.result?.body || !base) return false;
    if (draft.segmentEdit || draft.pendingVoice.trim() || !sameDocument(base, documentOf(draft))) {
      this.patch({ error: '正文已发生变化，请根据最新内容重新优化；旧结果仍可查看。' }); return false;
    }
    const next = { ...draft, segments: splitDraft(turn.result.body, draft.segments), textDraft: turn.result.body };
    const version = newVersion(next, turn.action);
    return this.commitArticle(next, { ...session, versions: [...session.versions, version],
      turns: session.turns.map(t => t.id === turn.id ? { ...t, status: 'applied', appliedVersionId: version.id } : t) });
  }
  async restoreVersion(versionId: string, expected: { title: string; body: string }): Promise<boolean> {
    if (!await this.checkpoint()) return false;
    const draft = this.state.draft;
    const session = this.getSession();
    const version = session?.versions.find(v => v.id === versionId);
    if (!draft || !session || !version) return false;
    if (draft.segmentEdit || draft.pendingVoice.trim() || !sameDocument(documentOf(draft), expected)) {
      this.patch({ error: '正文已发生变化，请重新查看历史版本后再恢复。' }); return false;
    }
    const next = { ...draft, title: version.title, textDraft: version.body, segments: splitDraft(version.body, draft.segments) };
    return this.commitArticle(next, { ...session, versions: [...session.versions, newVersion(next, 'restore')] });
  }
  private async commitArticle(draft: Draft, session: ArticleSession): Promise<boolean> {
    const previousDraft = this.state.draft;
    const previousSession = this.getSession();
    const saving = this.persist(draft, session);
    const serial = this.serial;
    const ok = await saving;
    // A failed transaction did not apply anything. Never roll back a later edit.
    if (!ok && serial === this.serial && previousDraft && previousSession) {
      this.dirtySessions.add(draft.id);
      this.patch({ draft: previousDraft, sessions: this.state.sessions.filter(s => s.workId !== draft.id).concat(previousSession) });
    }
    return ok;
  }
  async finish(): Promise<boolean> {
    if (!await this.checkpoint()) return false;
    // Typing may continue while an IndexedDB transaction is pending. Close only
    // after the latest revision, including edits during clearRecovery, is saved.
    while (this.state.draft) {
      if (!await this.checkpoint()) return false;
      const draft = this.state.draft;
      if (!await this.persist(draft)) return false;
      const serial = this.serial;
      try {
        await this.writer.flush(); await this.repository.clearRecovery(draft.id);
        if (serial !== this.serial) continue;
        clearTimeout(this.checkpointTimer);
        this.patch({ draft: null, saveStatus: 'idle' }); return true;
      } catch (error) { this.patch({ saveStatus: 'error', error: message(error) }); return false; }
    }
    return true;
  }
  async setDeleted(work: Work, deleted: boolean) {
    try {
      await this.writer.flush();
      await this.repository.setDeleted(work.id, deleted, work.revision);
      const { works } = await this.repository.load();
      this.patch({ works, error: null });
      return true;
    } catch (error) { this.patch({ error: message(error), saveStatus: 'error' }); return false; }
  }
  async import(raw: string) {
    const count = await this.repository.importBackup(raw);
    const { works, sessions = [] } = await this.repository.load();
    works.forEach(w => this.writer.seed(w.id, w.revision));
    this.patch({ works, sessions: sessions.map(recoverSession) });
    return count;
  }
}
