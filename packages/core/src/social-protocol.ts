import { z } from 'zod';
import { cloudIdSchema } from './cloud-protocol.js';
import type { PublicArticleCard } from './publication-protocol.js';

export const socialMutationSchema = z.object({ operationId: cloudIdSchema, expectedVersion: z.number().int().nonnegative(), active: z.boolean() }).strict();
export type SocialMutation = z.infer<typeof socialMutationSchema>;
export const socialOperationSchema = z.object({ operationId: cloudIdSchema }).strict();
export const commentInputSchema = socialOperationSchema.extend({ text: z.string().trim().refine(value => Array.from(value).length >= 1 && Array.from(value).length <= 300, '评论请填写 1–300 字') }).strict();
export type CommentInput = z.infer<typeof commentInputSchema>;
export const commentDeleteSchema = socialOperationSchema.extend({ expectedVersion: z.number().int().positive() }).strict();
export const commentReportSchema = socialOperationSchema.extend({ reason: z.string().trim().min(1).max(200) }).strict();
export const giftInputSchema = socialOperationSchema.extend({ gift: z.literal('flower') }).strict();
export const audienceInputSchema = socialOperationSchema.extend({ expectedVersion: z.number().int().nonnegative(), audience: z.enum(['account', 'guest']), consentVersion: z.literal('guest-reading-v1') }).strict();
export type AudienceInput = z.infer<typeof audienceInputSchema>;
export const commentReviewSchema = commentDeleteSchema.extend({ action: z.enum(['approve', 'reject', 'hide']), reason: z.string().trim().max(200).default('') }).strict();
export type CommentReview = z.infer<typeof commentReviewSchema>;
export const reportResolveSchema = commentDeleteSchema.extend({ reason: z.string().trim().min(1).max(200) }).strict();
export interface EngagementCounts { likes: number; comments: number; flowers: number }
export interface ReactionState { active: boolean; version: number }
export interface FollowState extends ReactionState { followedBy: boolean; mutual: boolean; self: boolean }
export interface FlowerWallet { balance: number; version: number; today: string; claimedToday: boolean; dailyAmount: 3 }
export interface GiftReceipt { operationId: string; articleId: string; gift: 'flower'; sent: true; balance: number; flowers: number }
export interface FlowerHistoryEntry { id: string; articleId: string; createdAt: string; amount: 1 }
export interface FlowerHistoryPage { entries: FlowerHistoryEntry[]; cursor: string | null }
export interface SocialSummary { publicAuthorId: string; following: number; followers: number; mutuals: number }
export interface PublicAuthor { id: string; name: string; avatar: 'default'; following: number; followers: number; flowers: number; articles: number }
export interface AuthorProfile extends PublicAuthor { relationship?: FollowState }
export interface PublicComment { id: string; articleId: string; publicAuthorId: string; authorName: string; avatar: 'default'; text: string; createdAt: string; version: number }
export type CommentState = 'pending' | 'approved' | 'rejected' | 'hidden' | 'deleted';
export interface OwnComment extends PublicComment { state: CommentState; reason: string }
export interface CommentPage { comments: PublicComment[]; cursor: string | null }
export interface Engagement { articleId: string; counts: EngagementCounts; like: ReactionState; collection: ReactionState; relationship: FollowState; wallet: FlowerWallet; ownComments: OwnComment[]; writesEnabled: boolean; commentsEnabled: boolean }
export interface ReactionResult extends ReactionState { counts: EngagementCounts }
export interface CollectionItem { articleId: string; available: boolean; article: PublicArticleCard | null; version: number; collectedAt: string }
export interface CollectionPage { collections: CollectionItem[]; cursor: string | null }
export interface RelationshipItem extends PublicAuthor { relationship: FollowState }
export interface RelationshipPage { authors: RelationshipItem[]; cursor: string | null }
export interface AdminComment extends OwnComment { articleTitle: string; articleAvailable: boolean; reports: number }
export interface AdminCommentPage { comments: AdminComment[]; cursor: string | null }
export interface CommentAudit { id: number; action: string; actor: string; version: number; reason: string; createdAt: string }
export interface AdminCommentReport { id: string; commentId: string; reason: string; state: 'pending' | 'resolved'; version: number; createdAt: string; resolution: string }
export interface AdminReportPage { reports: AdminCommentReport[]; cursor: string | null }
export const socialEventSchema = z.object({ eventId: cloudIdSchema, sessionId: cloudIdSchema, articleId: cloudIdSchema,
  event: z.enum(['share_entry_open', 'login_intent', 'login_success', 'return_visit']), action: z.enum(['read', 'like', 'collect', 'comment', 'gift', 'follow']) }).strict();
export type SocialEventInput = z.infer<typeof socialEventSchema>;
