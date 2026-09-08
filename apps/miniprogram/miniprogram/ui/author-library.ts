export interface AuthorListEntry {
  id: string;
  title: string;
  deleted: boolean;
  recovery: boolean;
  category: 'draft' | 'pending' | 'published' | 'unknown';
  published: boolean;
  updatedAt: string;
}

/** The overview never turns an unavailable publication status into a draft. */
export function authorOverview<T extends AuthorListEntry>(cards: T[]) {
  const active = cards.filter(item => !item.deleted);
  const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const draft = recent.find(item => item.category === 'draft' && !item.recovery) ?? null;
  return { total: active.length, published: active.filter(item => item.published).length,
    draft, recent: recent.filter(item => item.id !== draft?.id).slice(0, 2) };
}

export function selectAuthorArticles<T extends AuthorListEntry>(cards: T[], recycle: boolean, filter: string, query: string) {
  const search = query.normalize('NFKC').trim().toLocaleLowerCase();
  return cards.filter(item => item.deleted === recycle
    && (recycle || filter === 'all' || (filter === 'published' ? item.published : item.category === filter))
    && (!search || item.title.normalize('NFKC').toLocaleLowerCase().includes(search)));
}
