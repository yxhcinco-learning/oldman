import { z } from 'zod';
import { aiDisclosureFor, aiDisclosureSchema, type AiDisclosure, articleSessionSchema, type ArticleSession } from './article-ai.js';
import { topicSnapshotSchema, writingMaterialSchema } from './topics.js';
import { newId, normalizeWork, type Work, workFromDraft, hasContent, type Draft } from './writing.js';
import { cloneValue, utf8ByteLength } from './platform.js';
import { workWritingStateSchema, type WorkWritingState } from './writing-state.js';

const zodParseContext = { jitless: true } as const;

const segment = z.object({ id: z.string().min(1).max(128), text: z.string().max(1_000_000) }).strict();
const legacyDraft = z.object({
  id: z.string().min(1).max(128), title: z.string().max(120), segments: z.array(segment).max(10000),
  textDraft: z.string().max(1_000_000), inputMode: z.enum(['voice', 'text']), pendingVoice: z.string().max(1_000_000),
  segmentEdit: z.object({ id: z.string().min(1).max(128), text: z.string().max(1_000_000) }).strict().nullable(),
}).strict();
export const draftSchema = legacyDraft.extend({
  topicSnapshot: topicSnapshotSchema.nullable(), materials: z.array(writingMaterialSchema).max(10000), topicWritingMode: z.enum(['normal', 'interview']),
}).strict().refine(value => new Set(value.materials.map(item => item.id)).size === value.materials.length, '重复的素材标识');
const legacyWork = z.object({
  id: z.string().min(1).max(128), title: z.string().max(120), segments: z.array(segment).max(10000),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), revision: z.number().int().positive(),
  deletedAt: z.iso.datetime().nullable(), draft: legacyDraft,
}).strict().refine(w => w.id === w.draft.id, '作品与草稿 ID 不一致')
  .refine(w => new Set(w.draft.segments.map(s => s.id)).size === w.draft.segments.length, '重复的段落标识')
  .refine(w => JSON.stringify(w.segments) === JSON.stringify(w.draft.segments), '作品与编辑快照不一致')
  .refine(w => !w.draft.segmentEdit || w.draft.segmentEdit.id === 'pending' || w.draft.segments.some(s => s.id === w.draft.segmentEdit?.id), '无效的段落编辑信息');
export const workSchema = z.object({
  id: z.string().min(1).max(128), title: z.string().max(120), segments: z.array(segment).max(10000),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), revision: z.number().int().positive(),
  deletedAt: z.iso.datetime().nullable(), draft: draftSchema,
}).strict().refine(w => w.id === w.draft.id, '作品与草稿 ID 不一致')
  .refine(w => new Set(w.draft.segments.map(s => s.id)).size === w.draft.segments.length, '重复的段落标识')
  .refine(w => JSON.stringify(w.segments) === JSON.stringify(w.draft.segments), '作品与编辑快照不一致')
  .refine(w => !w.draft.segmentEdit || w.draft.segmentEdit.id === 'pending' || w.draft.segments.some(s => s.id === w.draft.segmentEdit?.id), '无效的段落编辑信息');
const backupV1 = z.object({ app: z.literal('suiyue-yousheng'), schemaVersion: z.literal(1), exportedAt: z.iso.datetime(), works: z.array(legacyWork).max(10000) }).strict();
const backupV2 = z.object({ app: z.literal('suiyue-yousheng'), schemaVersion: z.literal(2), exportedAt: z.iso.datetime(),
  works: z.array(legacyWork).max(10000), sessions: z.array(articleSessionSchema).max(10000) }).strict();
const backupV3 = z.object({ app: z.literal('suiyue-yousheng'), schemaVersion: z.literal(3), exportedAt: z.iso.datetime(),
  works: z.array(workSchema).max(10000), sessions: z.array(articleSessionSchema).max(10000) }).strict();
const backupV4 = z.object({ app: z.literal('suiyue-yousheng'), schemaVersion: z.literal(4), exportedAt: z.iso.datetime(),
  works: z.array(workSchema).max(10000), sessions: z.array(articleSessionSchema).max(10000),
  disclosures: z.array(aiDisclosureSchema).max(10000) }).strict();
const backupV5 = backupV4.extend({ schemaVersion: z.literal(5) });
const backupV6 = backupV4.extend({ schemaVersion: z.literal(6), writingStates: z.array(workWritingStateSchema).max(10000) });
export const backupSchema = z.discriminatedUnion('schemaVersion', [backupV1, backupV2, backupV3, backupV4, backupV5, backupV6]);
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function parseBackup(raw: string): Work[] {
  return parseBackupBundle(raw).works;
}
export function parseBackupBundle(raw: string): { works: Work[]; sessions: ArticleSession[]; disclosures: AiDisclosure[]; writingStates: WorkWritingState[] } {
  if (utf8ByteLength(raw) > MAX_BACKUP_BYTES) throw new Error('备份超过 10MB，请分批整理后再导入');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('这不是有效的 JSON 备份，原作品未改变'); }
  const result = backupSchema.safeParse(value, zodParseContext);
  if (!result.success) throw new Error('备份格式或版本不支持，原作品未改变');
  const works = result.data.works.map(work => normalizeWork(work as Work));
  const ids = new Set(works.map(w => w.id));
  if (ids.size !== result.data.works.length) throw new Error('备份包含重复作品标识，原作品未改变');
  const sessions: ArticleSession[] = result.data.schemaVersion === 1 ? [] : result.data.sessions;
  if (new Set(sessions.map(s => s.workId)).size !== sessions.length || sessions.some(s => !ids.has(s.workId))) {
    throw new Error('备份的会话与作品不匹配，原作品未改变');
  }
  const byWork = new Map(sessions.map(session => [session.workId, session]));
  const disclosures = works.map(work => aiDisclosureFor(work.id, byWork.get(work.id)));
  if ((result.data.schemaVersion === 4 || result.data.schemaVersion === 5 || result.data.schemaVersion === 6)) {
    const received = new Map(result.data.disclosures.map(disclosure => [disclosure.workId, disclosure]));
    if (received.size !== works.length || result.data.disclosures.length !== works.length || disclosures.some(expected => {
      const actual = received.get(expected.workId);
      return !actual || JSON.stringify(actual) !== JSON.stringify(expected);
    })) throw new Error('备份的 AI 披露与会话记录不一致，原作品未改变');
  }
  const writingStates = result.data.schemaVersion === 6 ? result.data.writingStates : [];
  if (new Set(writingStates.map(item => item.workId)).size !== writingStates.length || writingStates.some(item => !ids.has(item.workId))) {
    throw new Error('备份的输入状态与作品不匹配，原作品未改变');
  }
  return { works, sessions, disclosures, writingStates };
}
export function makeBackup(works: Work[], current?: Draft | null, sessions: ArticleSession[] = [], writingStates: WorkWritingState[] = []): string {
  let items = cloneValue(works);
  if (current && (hasContent(current) || sessions.some(session => session.workId === current.id && (session.turns.length || session.conversation)))) {
    const snapshot = workFromDraft(current, items.find(w => w.id === current.id));
    items = [...items.filter(w => w.id !== current.id), snapshot];
  }
  const ids = new Set(items.map(w => w.id));
  const includedSessions = sessions.filter(s => ids.has(s.workId));
  const byWork = new Map(includedSessions.map(session => [session.workId, session]));
  return JSON.stringify({ app: 'suiyue-yousheng', schemaVersion: 6, exportedAt: new Date().toISOString(), works: items,
    sessions: includedSessions, writingStates: writingStates.filter(item => ids.has(item.workId)),
    disclosures: items.map(work => aiDisclosureFor(work.id, byWork.get(work.id))) });
}

/** Every volume is independently importable and respects the existing input bound. */
export function makeBackupVolumes(works: Work[], sessions: ArticleSession[] = [], writingStates: WorkWritingState[] = [], maxBytes = MAX_BACKUP_BYTES): string[] {
  const volumes: string[] = [];
  let batch: Work[] = [];
  const serialize = (items: Work[]) => makeBackup(items, null, sessions, writingStates);
  for (const work of works) {
    const next = [...batch, work];
    if (utf8ByteLength(serialize(next)) <= maxBytes) { batch = next; continue; }
    if (batch.length) volumes.push(serialize(batch));
    batch = [work];
    if (utf8ByteLength(serialize(batch)) > maxBytes) throw new Error('单篇完整作品超过备份上限，请先单篇导出正文并保留本机原稿。');
  }
  if (batch.length || !volumes.length) volumes.push(serialize(batch));
  return volumes;
}
export function asImportedCopy(source: Work): Work {
  const copy = cloneValue(source);
  const id = newId();
  const ids = new Map(copy.draft.segments.map(s => [s.id, newId()]));
  copy.id = id; copy.draft.id = id;
  copy.draft.materials = copy.draft.materials.map(material => ({ ...material, id: newId() }));
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
