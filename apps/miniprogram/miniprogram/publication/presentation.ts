import { aiDisclosureFor, articleText, type ArticleSession, type Work, type PublicationStatus } from '../domain/core';
import type { OwnSubmission } from './client';

export function authorArticleAction(work: Work, session: ArticleSession | null | undefined, status?: PublicationStatus,
  submitted?: OwnSubmission, coverDirty = false) {
  const editor = '/pages/editor/index?id=' + encodeURIComponent(work.id);
  if (status?.pending) return { action: '查看审核', url: '/pages/publish/index?id=' + encodeURIComponent(work.id), changed: false };
  if (status?.lastSubmission?.state === 'rejected') return { action: '修改文章', url: editor, changed: false };
  const changed = Boolean(status?.published && (coverDirty || submitted && (
    work.draft.title.trim() !== submitted.title || articleText(work.segments) !== submitted.body ||
    aiDisclosureFor(work.id, session ?? null).aiAssisted !== submitted.aiAssisted || status.settings.assetId !== submitted.assetId)));
  if (status?.published && status.articleId && !changed) return { action: '查看文章',
    url: '/pages/article/index?id=' + encodeURIComponent(status.articleId), changed: false };
  return { action: '编辑文章', url: editor, changed };
}
