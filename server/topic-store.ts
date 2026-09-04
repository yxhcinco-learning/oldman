import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  isTopicCurrent,
  selectHomeTopics,
  topicPlacementSchema,
  writingTopicSchema,
  type TopicKind,
  type TopicPlacement,
  type WritingTopic,
} from '../lib/domain/topics';

const SCHEMA_VERSION = 1;
const SEED_MIGRATION = 'reviewed-topic-catalog-v1';
const EDITABLE_STATUSES = new Set(['draft', 'candidate']);
const FORMAL_STATUSES = new Set(['published', 'corrected']);

interface TopicRevisionRow {
  topic_id: string;
  revision: number;
  status: WritingTopic['status'];
  kind: WritingTopic['kind'];
  title: string;
  summary: string;
  why_it_matters: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  starter_question: string;
  tags_json: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  correction_note: string | null;
  edit_version: number;
  editor_brief: string;
}

interface CountRow { count: number }
interface IntegrityRow { quick_check: string }
interface PlacementRow { id: string; slot: number; topic_id: string; revision: number; starts_at: string; ends_at: string | null }

export interface StoredTopicRevision {
  topic: WritingTopic;
  editVersion: number;
  editorBrief: string;
}

export interface TopicGenerationRecord {
  id: string;
  topicId: string | null;
  revision: number | null;
  brief: string;
  urls: string[];
  webSearchEnabled: boolean;
  model: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  inputTokens?: number;
  outputTokens?: number;
  searchCalls?: number;
  errorCategory?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface TopicAuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  summary: Record<string, unknown>;
  createdAt: string;
}

export class TopicStoreError extends Error {
  constructor(readonly category: 'not_found' | 'invalid_state' | 'conflict' | 'integrity_failed', message: string) {
    super(message);
    this.name = 'TopicStoreError';
  }
}

export interface TopicStoreOptions {
  path: string;
  seed?: WritingTopic[];
  now?: () => Date;
}

export class TopicStore {
  readonly database: DatabaseSync;
  private readonly now: () => Date;

  constructor(options: TopicStoreOptions) {
    if (!options.path) throw new Error('Topic database path is required');
    this.now = options.now ?? (() => new Date());
    this.database = new DatabaseSync(options.path, { allowExtension: false });
    try {
      this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA trusted_schema = OFF; PRAGMA synchronous = FULL;');
      if (options.path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
      this.migrate();
      this.assertIntegrity();
      if (options.seed) this.importSeed(options.seed);
    } catch (error) {
      if (this.database.isOpen) this.database.close();
      throw error;
    }
  }

  private migrate() {
    const version = Number((this.database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);
    if (version > SCHEMA_VERSION) throw new Error('Topic database schema is newer than this release');
    if (version === SCHEMA_VERSION) return;
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE topics (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;
        CREATE TABLE topic_revisions (
          topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL CHECK (revision > 0),
          status TEXT NOT NULL CHECK (status IN ('draft','candidate','rejected','published','corrected','archived')),
          kind TEXT NOT NULL CHECK (kind IN ('current','periodic','slow')),
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          why_it_matters TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT,
          expires_at TEXT,
          starter_question TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          reviewed_by TEXT,
          reviewed_at TEXT,
          correction_note TEXT,
          edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version > 0),
          editor_brief TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (topic_id, revision)
        ) STRICT;
        CREATE INDEX topic_revisions_state_idx ON topic_revisions(status, published_at, expires_at);
        CREATE TABLE topic_sources (
          topic_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          position INTEGER NOT NULL CHECK (position >= 0),
          id TEXT NOT NULL,
          title TEXT NOT NULL,
          publisher TEXT NOT NULL,
          url TEXT NOT NULL,
          published_at TEXT NOT NULL,
          PRIMARY KEY (topic_id, revision, position),
          UNIQUE (topic_id, revision, id),
          FOREIGN KEY (topic_id, revision) REFERENCES topic_revisions(topic_id, revision) ON DELETE CASCADE
        ) STRICT;
        CREATE TABLE topic_angles (
          topic_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          position INTEGER NOT NULL CHECK (position >= 0),
          id TEXT NOT NULL,
          title TEXT NOT NULL,
          prompt TEXT NOT NULL,
          PRIMARY KEY (topic_id, revision, position),
          UNIQUE (topic_id, revision, id),
          FOREIGN KEY (topic_id, revision) REFERENCES topic_revisions(topic_id, revision) ON DELETE CASCADE
        ) STRICT;
        CREATE TABLE topic_generation_runs (
          id TEXT PRIMARY KEY,
          topic_id TEXT,
          revision INTEGER,
          brief TEXT NOT NULL,
          urls_json TEXT NOT NULL,
          web_search_enabled INTEGER NOT NULL CHECK (web_search_enabled IN (0,1)),
          model TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','cancelled')),
          input_tokens INTEGER,
          output_tokens INTEGER,
          search_calls INTEGER,
          error_category TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY (topic_id, revision) REFERENCES topic_revisions(topic_id, revision)
        ) STRICT;
        CREATE TABLE topic_home_placements (
          id TEXT PRIMARY KEY,
          slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
          topic_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          starts_at TEXT NOT NULL,
          ends_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (topic_id, revision) REFERENCES topic_revisions(topic_id, revision)
        ) STRICT;
        CREATE INDEX topic_home_slot_time_idx ON topic_home_placements(slot, starts_at, ends_at);
        CREATE TABLE topic_admin_users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          credential_fingerprint TEXT NOT NULL,
          active INTEGER NOT NULL CHECK (active IN (0,1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE topic_admin_sessions (
          id TEXT PRIMARY KEY,
          admin_id TEXT NOT NULL REFERENCES topic_admin_users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          csrf_hash TEXT NOT NULL,
          credential_fingerprint TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT
        ) STRICT;
        CREATE INDEX topic_admin_session_active_idx ON topic_admin_sessions(admin_id, expires_at, revoked_at);
        CREATE TABLE topic_audit_log (
          id TEXT PRIMARY KEY,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          summary_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX topic_audit_time_idx ON topic_audit_log(created_at DESC);
        CREATE TABLE topic_migrations (
          key TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        ) STRICT;
        PRAGMA user_version = 1;
      `);
    });
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private insertRevision(topicValue: WritingTopic, actor: string, editorBrief = '', editVersion = 1) {
    const topic = writingTopicSchema.parse(topicValue);
    const createdAt = this.now().toISOString();
    this.database.prepare('INSERT OR IGNORE INTO topics (id, created_at, archived_at) VALUES (?, ?, NULL)').run(topic.id, createdAt);
    this.database.prepare(`
      INSERT INTO topic_revisions (
        topic_id, revision, status, kind, title, summary, why_it_matters, updated_at, published_at, expires_at,
        starter_question, tags_json, reviewed_by, reviewed_at, correction_note, edit_version, editor_brief, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(topic.id, topic.revision, topic.status, topic.kind, topic.title, topic.summary, topic.whyItMatters, topic.updatedAt,
      topic.publishedAt, topic.expiresAt, topic.starterQuestion, JSON.stringify(topic.tags), topic.reviewedBy, topic.reviewedAt,
      topic.correctionNote ?? null, editVersion, editorBrief, actor, createdAt);
    const addSource = this.database.prepare(`
      INSERT INTO topic_sources (topic_id, revision, position, id, title, publisher, url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    topic.sources.forEach((item, position) => addSource.run(topic.id, topic.revision, position, item.id, item.title, item.publisher, item.url, item.publishedAt));
    const addAngle = this.database.prepare(`
      INSERT INTO topic_angles (topic_id, revision, position, id, title, prompt) VALUES (?, ?, ?, ?, ?, ?)
    `);
    topic.angles.forEach((item, position) => addAngle.run(topic.id, topic.revision, position, item.id, item.title, item.prompt));
  }

  private replaceEditableParts(topic: WritingTopic) {
    this.database.prepare('DELETE FROM topic_sources WHERE topic_id = ? AND revision = ?').run(topic.id, topic.revision);
    this.database.prepare('DELETE FROM topic_angles WHERE topic_id = ? AND revision = ?').run(topic.id, topic.revision);
    const addSource = this.database.prepare('INSERT INTO topic_sources (topic_id, revision, position, id, title, publisher, url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    topic.sources.forEach((item, position) => addSource.run(topic.id, topic.revision, position, item.id, item.title, item.publisher, item.url, item.publishedAt));
    const addAngle = this.database.prepare('INSERT INTO topic_angles (topic_id, revision, position, id, title, prompt) VALUES (?, ?, ?, ?, ?, ?)');
    topic.angles.forEach((item, position) => addAngle.run(topic.id, topic.revision, position, item.id, item.title, item.prompt));
  }

  private hydrate(row: TopicRevisionRow): StoredTopicRevision {
    const sources = this.database.prepare(`
      SELECT id, title, publisher, url, published_at AS publishedAt FROM topic_sources
      WHERE topic_id = ? AND revision = ? ORDER BY position
    `).all(row.topic_id, row.revision);
    const angles = this.database.prepare(`
      SELECT id, title, prompt FROM topic_angles WHERE topic_id = ? AND revision = ? ORDER BY position
    `).all(row.topic_id, row.revision);
    const topic = writingTopicSchema.parse({
      id: row.topic_id, revision: row.revision, status: row.status, kind: row.kind, title: row.title, summary: row.summary,
      whyItMatters: row.why_it_matters, updatedAt: row.updated_at, publishedAt: row.published_at, expiresAt: row.expires_at,
      sources, angles, starterQuestion: row.starter_question, tags: JSON.parse(row.tags_json), reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at, ...(row.correction_note ? { correctionNote: row.correction_note } : {}),
    });
    return { topic, editVersion: row.edit_version, editorBrief: row.editor_brief };
  }

  private revisionRow(id: string, revision: number) {
    return this.database.prepare('SELECT * FROM topic_revisions WHERE topic_id = ? AND revision = ?').get(id, revision) as TopicRevisionRow | undefined;
  }

  private nextRevision(id: string) {
    const row = this.database.prepare('SELECT COALESCE(MAX(revision), 0) AS revision FROM topic_revisions WHERE topic_id = ?').get(id) as { revision: number };
    return Number(row.revision) + 1;
  }

  importSeed(values: WritingTopic[]) {
    const applied = this.database.prepare('SELECT key FROM topic_migrations WHERE key = ?').get(SEED_MIGRATION);
    if (applied) return false;
    this.transaction(() => {
      for (const value of values) this.insertRevision(value, 'seed-migration');
      const visible = selectHomeTopics(values.filter(item => isTopicCurrent(item, this.now())), 5);
      const addPlacement = this.database.prepare(`
        INSERT INTO topic_home_placements (id, slot, topic_id, revision, starts_at, ends_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      visible.forEach((item, index) => addPlacement.run(randomUUID(), index + 1, item.id, item.revision, item.publishedAt, item.expiresAt, 'seed-migration', this.now().toISOString()));
      this.database.prepare('INSERT INTO topic_migrations (key, applied_at) VALUES (?, ?)').run(SEED_MIGRATION, this.now().toISOString());
    });
    return true;
  }

  assertIntegrity() {
    const result = (this.database.prepare('PRAGMA quick_check').get() as IntegrityRow | undefined)?.quick_check;
    if (result !== 'ok') throw new TopicStoreError('integrity_failed', '话题数据库完整性检查失败');
  }

  createEditable(topicValue: WritingTopic, actor: string, editorBrief = '') {
    if (!EDITABLE_STATUSES.has(topicValue.status)) throw new TopicStoreError('invalid_state', '只能创建草稿或候选');
    return this.transaction(() => {
      if (this.revisionRow(topicValue.id, topicValue.revision)) throw new TopicStoreError('conflict', '话题修订已经存在');
      this.insertRevision(topicValue, actor, editorBrief);
      this.audit(actor, 'topic.create', 'topic-revision', `${topicValue.id}:${topicValue.revision}`, { status: topicValue.status });
      return this.getRevision(topicValue.id, topicValue.revision)!;
    });
  }

  updateEditable(topicValue: WritingTopic, expectedEditVersion: number, actor: string) {
    const parsed = writingTopicSchema.parse(topicValue);
    return this.transaction(() => {
      const current = this.revisionRow(parsed.id, parsed.revision);
      if (!current) throw new TopicStoreError('not_found', '话题修订不存在');
      if (!EDITABLE_STATUSES.has(current.status)) throw new TopicStoreError('invalid_state', '正式修订不可原地修改');
      if (current.edit_version !== expectedEditVersion) throw new TopicStoreError('conflict', '话题已在其他页面更新');
      const nextVersion = expectedEditVersion + 1;
      this.database.prepare(`
        UPDATE topic_revisions SET status = ?, kind = ?, title = ?, summary = ?, why_it_matters = ?, updated_at = ?,
          expires_at = ?, starter_question = ?, tags_json = ?, correction_note = ?, edit_version = ?, created_by = ?
        WHERE topic_id = ? AND revision = ?
      `).run(parsed.status, parsed.kind, parsed.title, parsed.summary, parsed.whyItMatters, parsed.updatedAt, parsed.expiresAt,
        parsed.starterQuestion, JSON.stringify(parsed.tags), parsed.correctionNote ?? null, nextVersion, actor, parsed.id, parsed.revision);
      this.replaceEditableParts(parsed);
      this.audit(actor, 'topic.update', 'topic-revision', `${parsed.id}:${parsed.revision}`, { editVersion: nextVersion });
      return this.getRevision(parsed.id, parsed.revision)!;
    });
  }

  reject(id: string, revision: number, expectedEditVersion: number, actor: string) {
    return this.transaction(() => {
      const current = this.revisionRow(id, revision);
      if (!current) throw new TopicStoreError('not_found', '话题修订不存在');
      if (!EDITABLE_STATUSES.has(current.status)) throw new TopicStoreError('invalid_state', '只有草稿或候选可以拒绝');
      if (current.edit_version !== expectedEditVersion) throw new TopicStoreError('conflict', '话题已在其他页面更新');
      this.database.prepare("UPDATE topic_revisions SET status = 'rejected', edit_version = edit_version + 1 WHERE topic_id = ? AND revision = ?").run(id, revision);
      this.audit(actor, 'topic.reject', 'topic-revision', `${id}:${revision}`, {});
      return this.getRevision(id, revision)!;
    });
  }

  createCorrection(id: string, actor: string) {
    return this.transaction(() => {
      const latest = this.latestFormalRow(id);
      if (!latest) throw new TopicStoreError('not_found', '没有可更正的正式话题');
      const original = this.hydrate(latest).topic;
      const revision = this.nextRevision(id);
      const now = this.now().toISOString();
      const candidate = writingTopicSchema.parse({ ...original, revision, status: 'candidate', updatedAt: now,
        publishedAt: null, reviewedBy: null, reviewedAt: null, correctionNote: '请填写更正说明' });
      this.insertRevision(candidate, actor);
      this.audit(actor, 'topic.correct.create', 'topic-revision', `${id}:${revision}`, { fromRevision: original.revision });
      return this.getRevision(id, revision)!;
    });
  }

  private latestFormalRow(id: string) {
    return this.database.prepare(`
      SELECT * FROM topic_revisions WHERE topic_id = ? AND status IN ('published','corrected') ORDER BY revision DESC LIMIT 1
    `).get(id) as TopicRevisionRow | undefined;
  }

  private overlaps(slot: number, startsAt: string, endsAt: string | null, excludeId?: string) {
    const rows = this.database.prepare('SELECT * FROM topic_home_placements WHERE slot = ?').all(slot) as unknown as PlacementRow[];
    const end = endsAt ? new Date(endsAt).getTime() : Number.POSITIVE_INFINITY;
    const start = new Date(startsAt).getTime();
    return rows.find(row => row.id !== excludeId && start < (row.ends_at ? new Date(row.ends_at).getTime() : Number.POSITIVE_INFINITY) && new Date(row.starts_at).getTime() < end);
  }

  publishAndSchedule(id: string, revision: number, expectedEditVersion: number, actor: string, placementValue: TopicPlacement) {
    const placement = topicPlacementSchema.parse(placementValue);
    if (placement.topicId !== id || placement.revision !== revision) throw new TopicStoreError('invalid_state', '排期与话题不一致');
    return this.transaction(() => {
      const current = this.revisionRow(id, revision);
      if (!current) throw new TopicStoreError('not_found', '话题修订不存在');
      if (!EDITABLE_STATUSES.has(current.status)) throw new TopicStoreError('invalid_state', '只有草稿或候选可以发布');
      if (current.edit_version !== expectedEditVersion) throw new TopicStoreError('conflict', '话题已在其他页面更新');
      if (this.overlaps(placement.slot, placement.startsAt, placement.endsAt)) throw new TopicStoreError('conflict', '该首页席位在所选时间已有内容');
      const previous = this.latestFormalRow(id);
      const status: WritingTopic['status'] = previous ? 'corrected' : 'published';
      if (status === 'corrected' && !current.correction_note) throw new TopicStoreError('invalid_state', '更正版本需要填写更正说明');
      const reviewedAt = this.now().toISOString();
      this.database.prepare(`
        UPDATE topic_revisions SET status = ?, published_at = ?, expires_at = ?, reviewed_by = ?, reviewed_at = ?,
          updated_at = ?, edit_version = edit_version + 1 WHERE topic_id = ? AND revision = ?
      `).run(status, placement.startsAt, placement.endsAt ?? current.expires_at, actor, reviewedAt, reviewedAt, id, revision);
      this.database.prepare(`
        INSERT INTO topic_home_placements (id, slot, topic_id, revision, starts_at, ends_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), placement.slot, id, revision, placement.startsAt, placement.endsAt, actor, reviewedAt);
      this.audit(actor, 'topic.publish', 'topic-revision', `${id}:${revision}`, { slot: placement.slot, startsAt: placement.startsAt, endsAt: placement.endsAt });
      return this.getRevision(id, revision)!;
    });
  }

  listPlacements(slot?: number): Array<TopicPlacement & { id: string }> {
    const rows = (slot === undefined
      ? this.database.prepare('SELECT id, slot, topic_id, revision, starts_at, ends_at FROM topic_home_placements ORDER BY starts_at, slot').all()
      : this.database.prepare('SELECT id, slot, topic_id, revision, starts_at, ends_at FROM topic_home_placements WHERE slot = ? ORDER BY starts_at').all(slot)) as unknown as PlacementRow[];
    return rows.map(row => ({ id: row.id, slot: row.slot, topicId: row.topic_id, revision: row.revision, startsAt: row.starts_at, endsAt: row.ends_at }));
  }

  addPlacement(placementValue: TopicPlacement, actor: string) {
    const placement = topicPlacementSchema.parse(placementValue);
    return this.transaction(() => {
      const revision = this.revisionRow(placement.topicId, placement.revision);
      if (!revision || !FORMAL_STATUSES.has(revision.status)) throw new TopicStoreError('invalid_state', '只能排期正式修订');
      if (this.overlaps(placement.slot, placement.startsAt, placement.endsAt)) throw new TopicStoreError('conflict', '该首页席位在所选时间已有内容');
      const id = randomUUID();
      this.database.prepare(`INSERT INTO topic_home_placements
        (id, slot, topic_id, revision, starts_at, ends_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, placement.slot, placement.topicId, placement.revision, placement.startsAt, placement.endsAt, actor, this.now().toISOString());
      this.audit(actor, 'topic.schedule.create', 'topic-placement', id, { slot: placement.slot, startsAt: placement.startsAt, endsAt: placement.endsAt });
      return { id, ...placement };
    });
  }

  replacePlacement(placementId: string, placementValue: TopicPlacement, actor: string) {
    const placement = topicPlacementSchema.parse(placementValue);
    return this.transaction(() => {
      const current = this.database.prepare('SELECT * FROM topic_home_placements WHERE id = ?').get(placementId) as PlacementRow | undefined;
      if (!current) throw new TopicStoreError('not_found', '排期不存在');
      const revision = this.revisionRow(placement.topicId, placement.revision);
      if (!revision || !FORMAL_STATUSES.has(revision.status)) throw new TopicStoreError('invalid_state', '只能排期正式修订');
      if (this.overlaps(placement.slot, placement.startsAt, placement.endsAt, placementId)) throw new TopicStoreError('conflict', '该首页席位在所选时间已有内容');
      this.database.prepare('UPDATE topic_home_placements SET slot = ?, topic_id = ?, revision = ?, starts_at = ?, ends_at = ?, created_by = ? WHERE id = ?')
        .run(placement.slot, placement.topicId, placement.revision, placement.startsAt, placement.endsAt, actor, placementId);
      this.audit(actor, 'topic.schedule.update', 'topic-placement', placementId, { slot: placement.slot, startsAt: placement.startsAt, endsAt: placement.endsAt });
      return { id: placementId, ...placement };
    });
  }

  deletePlacement(placementId: string, actor: string) {
    return this.transaction(() => {
      const result = this.database.prepare('DELETE FROM topic_home_placements WHERE id = ?').run(placementId);
      if (!result.changes) throw new TopicStoreError('not_found', '排期不存在');
      this.audit(actor, 'topic.schedule.delete', 'topic-placement', placementId, {});
    });
  }

  archive(id: string, revision: number, actor: string) {
    return this.transaction(() => {
      const now = this.now().toISOString();
      const current = this.revisionRow(id, revision);
      const latest = this.latestFormalRow(id);
      if (!current || !latest) throw new TopicStoreError('not_found', '话题不存在或已下线');
      if (!FORMAL_STATUSES.has(current.status) || latest.revision !== revision) throw new TopicStoreError('conflict', '只能下线最新的正式修订');
      const result = this.database.prepare('UPDATE topics SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(now, id);
      if (!result.changes) throw new TopicStoreError('not_found', '话题不存在或已下线');
      this.database.prepare('DELETE FROM topic_home_placements WHERE topic_id = ? AND (ends_at IS NULL OR ends_at > ?)').run(id, now);
      const archived = writingTopicSchema.parse({ ...this.hydrate(current).topic, revision: this.nextRevision(id), status: 'archived', updatedAt: now });
      this.insertRevision(archived, actor);
      this.audit(actor, 'topic.archive', 'topic-revision', `${id}:${archived.revision}`, { fromRevision: revision });
      return this.getRevision(id, archived.revision)!;
    });
  }

  getRevision(id: string, revision: number) {
    const row = this.revisionRow(id, revision);
    return row ? this.hydrate(row) : undefined;
  }

  listRevisions(id: string) {
    const rows = this.database.prepare('SELECT * FROM topic_revisions WHERE topic_id = ? ORDER BY revision DESC').all(id) as unknown as TopicRevisionRow[];
    return rows.map(row => this.hydrate(row));
  }

  listAdmin(options: { status?: WritingTopic['status']; kind?: TopicKind; query?: string } = {}) {
    const rows = this.database.prepare(`
      SELECT r.* FROM topic_revisions r
      JOIN (SELECT topic_id, MAX(revision) AS revision FROM topic_revisions GROUP BY topic_id) latest
        ON latest.topic_id = r.topic_id AND latest.revision = r.revision
      WHERE (? IS NULL OR r.status = ?) AND (? IS NULL OR r.kind = ?) AND (? = '' OR r.title LIKE '%' || ? || '%' OR r.summary LIKE '%' || ? || '%')
      ORDER BY r.updated_at DESC, r.title
    `).all(options.status ?? null, options.status ?? null, options.kind ?? null, options.kind ?? null,
      options.query?.trim() ?? '', options.query?.trim() ?? '', options.query?.trim() ?? '') as unknown as TopicRevisionRow[];
    return rows.map(row => this.hydrate(row));
  }

  listHome(options: { now?: Date; kind?: TopicKind; limit?: number } = {}) {
    const now = (options.now ?? this.now()).toISOString();
    const limit = Math.max(1, Math.min(20, options.limit ?? 20));
    const rows = this.database.prepare(`
      SELECT r.* FROM topic_home_placements p
      JOIN topics t ON t.id = p.topic_id
      JOIN topic_revisions r ON r.topic_id = p.topic_id AND r.revision = p.revision
      WHERE t.archived_at IS NULL AND p.starts_at <= ? AND (p.ends_at IS NULL OR p.ends_at > ?)
        AND r.status IN ('published','corrected') AND r.published_at IS NOT NULL AND r.published_at <= ?
        AND (r.expires_at IS NULL OR r.expires_at > ?) AND (? IS NULL OR r.kind = ?)
      ORDER BY p.slot LIMIT ?
    `).all(now, now, now, now, options.kind ?? null, options.kind ?? null, limit) as unknown as TopicRevisionRow[];
    return rows.map(row => this.hydrate(row).topic);
  }

  getPublished(id: string, nowValue = this.now()) {
    const now = nowValue.toISOString();
    const row = this.database.prepare(`
      SELECT r.* FROM topic_revisions r JOIN topics t ON t.id = r.topic_id
      WHERE r.topic_id = ? AND t.archived_at IS NULL AND r.status IN ('published','corrected')
        AND r.published_at IS NOT NULL AND r.published_at <= ? AND (r.expires_at IS NULL OR r.expires_at > ?)
      ORDER BY r.revision DESC LIMIT 1
    `).get(id, now, now) as TopicRevisionRow | undefined;
    return row ? this.hydrate(row).topic : undefined;
  }

  startGeneration(record: Omit<TopicGenerationRecord, 'id' | 'status' | 'createdAt'>) {
    const value: TopicGenerationRecord = { ...record, id: randomUUID(), status: 'running', createdAt: this.now().toISOString() };
    this.database.prepare(`
      INSERT INTO topic_generation_runs (id, topic_id, revision, brief, urls_json, web_search_enabled, model, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.id, value.topicId, value.revision, value.brief, JSON.stringify(value.urls), value.webSearchEnabled ? 1 : 0,
      value.model, value.status, value.createdBy, value.createdAt);
    return value;
  }

  finishGeneration(id: string, patch: Pick<TopicGenerationRecord, 'status'> & Partial<Pick<TopicGenerationRecord, 'topicId' | 'revision' | 'inputTokens' | 'outputTokens' | 'searchCalls' | 'errorCategory'>>) {
    const completedAt = this.now().toISOString();
    this.database.prepare(`
      UPDATE topic_generation_runs SET topic_id = ?, revision = ?, status = ?, input_tokens = ?, output_tokens = ?,
        search_calls = ?, error_category = ?, completed_at = ? WHERE id = ?
    `).run(patch.topicId ?? null, patch.revision ?? null, patch.status, patch.inputTokens ?? null, patch.outputTokens ?? null,
      patch.searchCalls ?? null, patch.errorCategory ?? null, completedAt, id);
  }

  listGenerations(limit = 50): TopicGenerationRecord[] {
    const rows = this.database.prepare('SELECT * FROM topic_generation_runs ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(200, limit))) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: String(row.id), topicId: row.topic_id ? String(row.topic_id) : null, revision: row.revision === null ? null : Number(row.revision),
      brief: String(row.brief), urls: JSON.parse(String(row.urls_json)) as string[], webSearchEnabled: Boolean(row.web_search_enabled),
      model: String(row.model), status: row.status as TopicGenerationRecord['status'], inputTokens: row.input_tokens === null ? undefined : Number(row.input_tokens),
      outputTokens: row.output_tokens === null ? undefined : Number(row.output_tokens), searchCalls: row.search_calls === null ? undefined : Number(row.search_calls),
      errorCategory: row.error_category ? String(row.error_category) : undefined, createdBy: String(row.created_by), createdAt: String(row.created_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
    }));
  }

  audit(actor: string, action: string, entity: string, entityId: string, summary: Record<string, unknown>) {
    const entry: TopicAuditEntry = { id: randomUUID(), actor, action, entity, entityId, summary, createdAt: this.now().toISOString() };
    this.database.prepare('INSERT INTO topic_audit_log (id, actor, action, entity, entity_id, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(entry.id, entry.actor, entry.action, entry.entity, entry.entityId, JSON.stringify(entry.summary), entry.createdAt);
    return entry;
  }

  listAudit(limit = 100): TopicAuditEntry[] {
    const rows = this.database.prepare('SELECT * FROM topic_audit_log ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(500, limit))) as Array<Record<string, unknown>>;
    return rows.map(row => ({ id: String(row.id), actor: String(row.actor), action: String(row.action), entity: String(row.entity),
      entityId: String(row.entity_id), summary: JSON.parse(String(row.summary_json)) as Record<string, unknown>, createdAt: String(row.created_at) }));
  }

  statistics() {
    const count = (table: 'topics' | 'topic_revisions' | 'topic_generation_runs' | 'topic_home_placements' | 'topic_audit_log') =>
      Number((this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as unknown as CountRow).count);
    return { topics: count('topics'), revisions: count('topic_revisions'), generations: count('topic_generation_runs'),
      placements: count('topic_home_placements'), audits: count('topic_audit_log'),
      journalMode: String((this.database.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode),
      schemaVersion: Number((this.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version) };
  }

  close() {
    if (this.database.isOpen) this.database.close();
  }
}
