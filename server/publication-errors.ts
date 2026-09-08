export class PublicationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'PublicationError'; }
}
export const publicationMissing = () => new PublicationError(404, 'article_unavailable', '这篇文章暂时无法查看。');
export const publicationConflict = () => new PublicationError(409, 'publication_conflict', '文章或发表设置已变化，请刷新后重试。');
