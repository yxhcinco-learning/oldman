import { emptyDraft, type Draft, type Work } from '../../lib/domain/writing';
import { DraftWriter, type WorkRepository } from '../../lib/storage/repository';

export interface WorkspaceState {
  loading: boolean; works: Work[]; draft: Draft | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'; error: string | null;
}
const message = (error: unknown) => error instanceof Error ? error.message : '本机保存暂时不可用，请导出备份';
export class Workspace {
  state: WorkspaceState = { loading: true, works: [], draft: null, saveStatus: 'idle', error: null };
  private listeners = new Set<() => void>();
  private writer: DraftWriter;
  private initPromise?: Promise<void>;
  private serial = 0;
  constructor(private repository: WorkRepository) { this.writer = new DraftWriter(repository); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(next: Partial<WorkspaceState>) { this.state = { ...this.state, ...next }; this.listeners.forEach(fn => fn()); }
  initialize() {
    this.initPromise ??= this.repository.load().then(({ works, recovery }) => {
      works.forEach(w => this.writer.seed(w.id, w.revision));
      if (recovery) this.writer.seed(recovery.draft.id, recovery.revision);
      this.patch({ loading: false, works, draft: recovery?.draft ?? null, saveStatus: recovery ? 'saved' : 'idle' });
    }).catch(error => this.patch({ loading: false, error: message(error), saveStatus: 'error' }));
    return this.initPromise;
  }
  async newWork() { const draft = emptyDraft(); this.writer.seed(draft.id, 0); await this.update(draft); }
  async open(work: Work) { this.writer.seed(work.id, work.revision); await this.update(structuredClone(work.draft)); }
  update(draft: Draft): Promise<boolean> {
    const serial = ++this.serial;
    this.patch({ draft, saveStatus: 'saving', error: null });
    return this.writer.write(draft).then(work => {
      const works = work ? [...this.state.works.filter(w => w.id !== work.id), work].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : this.state.works;
      this.patch({ works, ...(serial === this.serial ? { saveStatus: 'saved' as const, error: null } : {}) });
      return true;
    }).catch(error => { if (serial === this.serial) this.patch({ saveStatus: 'error', error: message(error) }); return false; });
  }
  async finish(): Promise<boolean> {
    // Typing may continue while an IndexedDB transaction is pending. Close only
    // after the latest revision, including edits during clearRecovery, is saved.
    while (this.state.draft) {
      const draft = this.state.draft;
      if (!await this.update(draft)) return false;
      const serial = this.serial;
      try {
        await this.writer.flush(); await this.repository.clearRecovery(draft.id);
        if (serial !== this.serial) continue;
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
    const { works } = await this.repository.load();
    works.forEach(w => this.writer.seed(w.id, w.revision));
    this.patch({ works });
    return count;
  }
}
