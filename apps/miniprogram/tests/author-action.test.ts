import { describe, expect, it } from 'vitest';
import { emptyDraft, workFromDraft, type PublicationStatus } from '../miniprogram/domain/core';
import { authorArticleAction } from '../miniprogram/publication/presentation';
import type { OwnSubmission } from '../miniprogram/publication/client';

const work = workFromDraft({ ...emptyDraft(), id: 'private-work', title: '清晨', inputMode: 'text', textDraft: '确认正文' });
const submitted: OwnSubmission = { id: 'submission', state: 'approved', reason: '', createdAt: '2026-09-07', title: '清晨', body: '确认正文', authorName: '投稿时署名', aiAssisted: false, assetId: 'cover' };
const status: PublicationStatus = { workId: work.id, articleId: 'public-article', version: 2, settings: { version: 1, assetId: 'cover', crops: null }, published: true, pending: null, lastSubmission: submitted, reason: '' };
describe('作者文章只有一个明确入口', () => {
  it('草稿进入编辑，已发表且无修改进入公共文章，不泄露私有作品 ID', () => {
    expect(authorArticleAction(work, null).action).toBe('编辑文章');
    const action = authorArticleAction(work, null, status, submitted);
    expect(action).toEqual({ action: '查看文章', url: '/pages/article/index?id=public-article', changed: false });
    expect(action.url).not.toContain(work.id);
  });
  it('正文或封面变化进入修改稿，署名仍采用投稿时的历史名字', () => {
    const edited = workFromDraft({ ...work.draft, textDraft: '修改后的正文' });
    expect(authorArticleAction(edited, null, status, submitted)).toMatchObject({ action: '编辑文章', changed: true });
    expect(authorArticleAction(work, null, status, submitted, true)).toMatchObject({ action: '编辑文章', changed: true });
    expect(authorArticleAction(work, null, { ...status, settings: { ...status.settings, assetId: 'new-cover' } }, submitted).changed).toBe(true);
    expect(authorArticleAction(work, null, status, { ...submitted, authorName: '另一个历史署名' }).changed).toBe(false);
  });
  it('待审优先查看冻结投稿，未通过进入修改，公开旧版仍是一条作品', () => {
    expect(authorArticleAction(work, null, { ...status, pending: { ...submitted, state: 'pending' } }, submitted, true)).toMatchObject({ action: '查看审核', changed: false });
    expect(authorArticleAction(work, null, { ...status, lastSubmission: { ...submitted, state: 'rejected' } }, submitted).action).toBe('修改文章');
  });
});
