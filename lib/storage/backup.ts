import { z } from 'zod';
import { newId, type Work, workFromDraft, hasContent, type Draft } from '../domain/writing';
import { articleSessionSchema, type ArticleSession } from '../domain/article-ai';

const segment = z.object({ id: z.string().min(1).max(128), text: z.string().max(1_000_000) }).strict();
const draft = z.object({
  id: z.string().min(1).max(128), title: z.string().max(120), segments: z.array(segment).max(10000),
  textDraft: z.string().max(1_000_000), inputMode: z.enum(['voice', 'text']), pendingVoice: z.string().max(1_000_000),
  segmentEdit: z.object({ id: z.string().min(1).max(128), text: z.string().max(1_000_000) }).strict().nullable(),
}).strict();
const work = z.object({
  id: z.string().min(1).max(128), title: z.string().max(120), segments: z.array(segment).max(10000),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), revision: z.number().int().positive(),
  deletedAt: z.iso.datetime().nullable(), draft,
}).strict().refine(w => w.id === w.draft.id, '作品与草稿 ID 不一致')
  .refine(w => new Set(w.draft.segments.map(s => s.id)).size === w.draft.segments.length, '重复的段落标识')
  .refine(w => JSON.stringify(w.segments) === JSON.stringify(w.draft.segments), '作品与编辑快照不一致')
  .refine(w => !w.draft.segmentEdit || w.draft.segmentEdit.id === 'pending' || w.draft.segments.some(s => s.id === w.draft.segmentEdit?.id), '无效的段落编辑信息');
const backupV1 = z.object({ app: z.literal('suiyue-yousheng'), schemaVersion: z.literal(1), exportedAt: z.iso.datetime(), works: z.array(work).max(10000) }).strict();
export const backupSchema = z.discriminatedUnion('schemaVersion', [backupV1, backupV1.extend({
  schemaVersion: z.literal(2), sessions: z.array(articleSessionSchema).max(10000),
})]);
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function parseBackup(raw: string): Work[] {
  return parseBackupBundle(raw).works;
}
export function parseBackupBundle(raw: string): { works: Work[]; sessions: ArticleSession[] } {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error('备份超过 10MB，请分批整理后再导入');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('这不是有效的 JSON 备份，原作品未改变'); }
  const result = backupSchema.safeParse(value);
  if (!result.success) throw new Error('备份格式或版本不支持，原作品未改变');
  const ids = new Set(result.data.works.map(w => w.id));
  if (ids.size !== result.data.works.length) throw new Error('备份包含重复作品标识，原作品未改变');
  const sessions = result.data.schemaVersion === 2 ? result.data.sessions : [];
  if (new Set(sessions.map(s => s.workId)).size !== sessions.length || sessions.some(s => !ids.has(s.workId))) {
    throw new Error('备份的会话与作品不匹配，原作品未改变');
  }
  return { works: result.data.works, sessions };
}
export function makeBackup(works: Work[], current?: Draft | null, sessions: ArticleSession[] = []): string {
  let items = structuredClone(works);
  if (current && hasContent(current)) {
    const snapshot = workFromDraft(current, items.find(w => w.id === current.id));
    items = [...items.filter(w => w.id !== current.id), snapshot];
  }
  const ids = new Set(items.map(w => w.id));
  return JSON.stringify({ app: 'suiyue-yousheng', schemaVersion: 2, exportedAt: new Date().toISOString(), works: items,
    sessions: sessions.filter(s => ids.has(s.workId)) }, null, 2);
}
export function asImportedCopy(source: Work): Work {
  const copy = structuredClone(source);
  const id = newId();
  const ids = new Map(copy.draft.segments.map(s => [s.id, newId()]));
  copy.id = id; copy.draft.id = id;
  copy.segments = copy.segments.map(s => ({ ...s, id: ids.get(s.id) ?? newId() }));
  copy.draft.segments = copy.draft.segments.map(s => ({ ...s, id: ids.get(s.id)! }));
  if (copy.draft.segmentEdit && copy.draft.segmentEdit.id !== 'pending') {
    const mapped = ids.get(copy.draft.segmentEdit.id);
    if (!mapped) throw new Error('备份的段落编辑信息无效，原作品未改变');
    copy.draft.segmentEdit.id = mapped;
  }
  copy.title = `${copy.title.slice(0, 110)}（副本）`;
  copy.draft.title = copy.title;
  copy.revision = 1; copy.createdAt = copy.updatedAt = new Date().toISOString();
  return copy;
}
