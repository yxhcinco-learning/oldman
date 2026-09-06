import { articleSessionSchema, draftSchema, workSchema, z, writingStateSchema, emptyWritingState, cloudMutationSchema,
  cloudIdSchema, type ArticleSession, type Work, type WritingState } from '../domain/core';

export const LOCAL_SCHEMA_VERSION = 3 as const;
const localVersionSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]).transform(() => LOCAL_SCHEMA_VERSION);
export const cloudMetadataSchema = z.object({
  version: z.number().int().nonnegative(), syncedRevision: z.number().int().nonnegative(),
  operation: cloudMutationSchema.nullable(), operationRevision: z.number().int().nonnegative(),
  recoveryOf: cloudIdSchema.nullable(), recoverySourceRevision: z.number().int().nonnegative(),
  claim: z.object({ accountId: cloudIdSchema, targetId: cloudIdSchema, complete: z.boolean() }).strict().nullable(),
}).strict();
export type CloudMetadata = z.infer<typeof cloudMetadataSchema>;
export const emptyCloudMetadata = (): CloudMetadata => ({ version: 0, syncedRevision: 0, operation: null, operationRevision: 0,
  recoveryOf: null, recoverySourceRevision: 0, claim: null });

export const aggregateSchema = z.object({
  app: z.literal('suiyue-yousheng'),
  schemaVersion: localVersionSchema,
  savedAt: z.iso.datetime(),
  work: workSchema,
  session: articleSessionSchema.nullable(),
  writingState: writingStateSchema.default(emptyWritingState),
  cloud: cloudMetadataSchema.default(emptyCloudMetadata),
}).strict().superRefine((value, ctx) => {
  if (value.session && value.session.workId !== value.work.id) ctx.addIssue({ code: 'custom', message: '会话与作品不匹配' });
  if (value.cloud.operation && value.cloud.operation.workId !== value.work.id) ctx.addIssue({ code: 'custom', message: '同步操作与作品不匹配' });
});

export interface WorkAggregate {
  app: 'suiyue-yousheng';
  schemaVersion: typeof LOCAL_SCHEMA_VERSION;
  savedAt: string;
  work: Work;
  session: ArticleSession | null;
  writingState?: WritingState;
  cloud?: CloudMetadata;
}

export const indexEntrySchema = z.object({
  id: z.string().min(1).max(128),
  fileName: z.string().regex(/^[A-Za-z0-9_-]+\.work\.json$/),
  title: z.string().max(120),
  updatedAt: z.iso.datetime(),
  revision: z.number().int().positive(),
  deletedAt: z.iso.datetime().nullable(),
}).strict();

export const repositoryIndexSchema = z.object({
  schemaVersion: localVersionSchema,
  generatedAt: z.iso.datetime(),
  entries: z.array(indexEntrySchema).max(10000),
}).strict();
export type RepositoryIndex = z.infer<typeof repositoryIndexSchema>;

export const recoveryRecordSchema = z.object({
  schemaVersion: localVersionSchema,
  workId: z.string().min(1).max(128),
  expectedRevision: z.number().int().nonnegative(),
  recoveryRevision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  draft: draftSchema,
  session: articleSessionSchema.nullable(),
  writingState: writingStateSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.workId !== value.draft.id || value.session && value.session.workId !== value.workId) {
    ctx.addIssue({ code: 'custom', message: '恢复记录与作品不匹配' });
  }
});
export type RecoveryRecord = z.infer<typeof recoveryRecordSchema>;
