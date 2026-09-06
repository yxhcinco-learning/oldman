import { z } from 'zod';
import { workSchema } from './backup.js';
import { articleSessionSchema } from './article-ai.js';
import { writingStateSchema } from './writing-state.js';

export const cloudIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const workSnapshotSchema = z.object({
  work: workSchema,
  session: articleSessionSchema.nullable(),
  writingState: writingStateSchema,
}).strict().superRefine((snapshot, ctx) => {
  if (!cloudIdSchema.safeParse(snapshot.work.id).success || snapshot.session && snapshot.session.workId !== snapshot.work.id) {
    ctx.addIssue({ code: 'custom', message: '作品标识或会话关联无效' });
  }
});
export type WorkSnapshot = z.infer<typeof workSnapshotSchema>;
export const cloudMutationSchema = z.object({
  operationId: cloudIdSchema,
  workId: cloudIdSchema,
  kind: z.enum(['create', 'save', 'trash', 'restore', 'purge']),
  baseVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  snapshot: workSnapshotSchema.optional(),
}).strict().superRefine((mutation, ctx) => {
  const writes = mutation.kind === 'create' || mutation.kind === 'save';
  if (writes !== Boolean(mutation.snapshot) || mutation.snapshot && mutation.snapshot.work.id !== mutation.workId ||
      mutation.kind === 'create' && mutation.baseVersion !== 0 || mutation.kind !== 'create' && mutation.baseVersion === 0) {
    ctx.addIssue({ code: 'custom', message: '同步操作无效' });
  }
});
export type CloudMutation = z.infer<typeof cloudMutationSchema>;
export const cloudWorkEntrySchema = z.object({
  id: cloudIdSchema, version: z.number().int().positive(), sequence: z.number().int().positive(),
  title: z.string().max(120), updatedAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable(), purged: z.boolean(),
}).strict();
export type CloudWorkEntry = z.infer<typeof cloudWorkEntrySchema>;
export const cloudWorkSchema = cloudWorkEntrySchema.extend({ snapshot: workSnapshotSchema.nullable() }).strict();
export type CloudWork = z.infer<typeof cloudWorkSchema>;
export const cloudChangesSchema = z.object({ entries: z.array(cloudWorkEntrySchema).max(100), cursor: z.number().int().nonnegative(), hasMore: z.boolean() }).strict();
export type CloudChanges = z.infer<typeof cloudChangesSchema>;
export const cloudMutationResultSchema = z.object({ operationId: cloudIdSchema, entry: cloudWorkEntrySchema }).strict();
export type CloudMutationResult = z.infer<typeof cloudMutationResultSchema>;
export const accountProfileSchema = z.object({
  id: cloudIdSchema, nickname: z.string().max(64), avatarVersion: z.number().int().nonnegative(),
  hasAvatar: z.boolean(), expiresAt: z.iso.datetime(),
}).strict();
export type AccountProfile = z.infer<typeof accountProfileSchema>;
export const accountLoginSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43,256}$/), account: accountProfileSchema }).strict();

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}
