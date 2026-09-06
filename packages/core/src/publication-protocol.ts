import { z } from 'zod';
import { cloudIdSchema } from './cloud-protocol.js';

export const cropSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
  .refine(c => c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001, '裁切超出图片');
export const coverCropsSchema = z.object({ thumbnail: cropSchema, reading: cropSchema }).strict();
export type CoverCrops = z.infer<typeof coverCropsSchema>;
export type ImageVariant = 'master' | 'thumbnail' | 'reading';
export const publicationContentSchema = z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(8 * 1024 * 1024),
  authorName: z.string().min(1).max(64), aiAssisted: z.boolean() }).strict();
export type PublicationContent = z.infer<typeof publicationContentSchema>;
export const publicationSettingsInputSchema = z.object({ operationId: cloudIdSchema, expectedVersion: z.number().int().nonnegative(),
  assetId: cloudIdSchema, crops: coverCropsSchema }).strict();
export type PublicationSettingsInput = z.infer<typeof publicationSettingsInputSchema>;
export const submissionInputSchema = z.object({ operationId: cloudIdSchema, workVersion: z.number().int().positive(),
  settingsVersion: z.number().int().positive(), authorName: z.string().min(1).max(64), expectedVersion: z.number().int().nonnegative() }).strict();
export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export const publicationActionSchema = z.object({ operationId: cloudIdSchema, expectedVersion: z.number().int().nonnegative(),
  action: z.enum(['withdraw-review', 'withdraw', 'approve', 'reject', 'takedown']), reason: z.string().trim().max(200).default('') }).strict();
export type PublicationAction = z.infer<typeof publicationActionSchema>;
export interface PublicationSettings { version: number; assetId: string | null; crops: CoverCrops | null }
export interface SubmissionSummary { id: string; state: 'pending' | 'approved' | 'rejected' | 'withdrawn'; reason: string; createdAt: string }
export interface PublicationStatus {
  workId: string; articleId: string | null; version: number; settings: PublicationSettings;
  pending: SubmissionSummary | null; published: boolean; lastSubmission: SubmissionSummary | null; reason: string;
}
export interface PublicationPreview extends PublicationContent { articleId: string; assetId: string; workVersion: number; settingsVersion: number; version: number }
export interface PublicArticleCard { id: string; title: string; authorName: string; aiAssisted: boolean; publishedAt: string; version: number }
export interface PublicArticle extends PublicArticleCard { body: string }
export interface PublicArticlePage { articles: PublicArticleCard[]; cursor: string | null }
export interface AdminArticle extends PublicationContent {
  id: string; version: number; submission: SubmissionSummary; published: boolean; publishedAt: string | null;
}
export interface PublicationAudit { id: number; action: string; actor: string; version: number; reason: string; createdAt: string }

export function centeredCrops(width: number, height: number): CoverCrops {
  const crop = (ratio: number) => {
    const w = Math.min(width, height * ratio), h = w / ratio;
    return { x: (width - w) / width / 2, y: (height - h) / height / 2, width: w / width, height: h / height };
  };
  return { thumbnail: crop(1), reading: crop(1.25) };
}

export function publicationLabel(status?: PublicationStatus) {
  if (!status) return '草稿';
  if (status.pending) return status.published ? '已发表 · 修改审核中' : '审核中';
  if (status.lastSubmission?.state === 'rejected') return status.published ? '已发表 · 修改未通过' : '未通过';
  return status.published ? '已发表' : status.reason ? '已撤下' : '草稿';
}
