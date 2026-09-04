import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 1;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const RETENTION_DAYS = 400;

export type CostService = 'article_ai' | 'topic_ai' | 'speech';

export interface CostGovernanceLimits {
  articleAiDailyTokens: number;
  topicAiDailyTokens: number;
  speechDailySeconds: number;
}

export interface CostEstimateRates {
  deepseekInputCnyPerMillion?: number;
  deepseekOutputCnyPerMillion?: number;
  tencentAsrCnyPerHour?: number;
}

export interface CostReservation {
  id: string;
  day: string;
  service: CostService;
  inputTokens: number;
  outputTokens: number;
  speechSeconds: number;
}

export interface AiCostSnapshot {
  inputTokens: number;
  outputTokens: number;
  usedTokens: number;
  reservedTokens: number;
  limitTokens: number;
  remainingTokens: number;
  estimatedCny: number | null;
}

export interface SpeechCostSnapshot {
  usedSeconds: number;
  reservedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
  estimatedCny: number | null;
}

export interface CostGovernanceSnapshot {
  day: string;
  timezone: 'Asia/Shanghai';
  generatedAt: string;
  resetsAt: string;
  articleAi: AiCostSnapshot;
  topicAi: AiCostSnapshot;
  speech: SpeechCostSnapshot;
}

interface UsageRow {
  article_input_tokens: number;
  article_output_tokens: number;
  topic_input_tokens: number;
  topic_output_tokens: number;
  speech_seconds: number;
}

interface ReservedRow {
  article_input_tokens: number;
  article_output_tokens: number;
  topic_input_tokens: number;
  topic_output_tokens: number;
  speech_seconds: number;
}

interface ReservationRow {
  id: string;
  day: string;
  service: CostService;
  input_tokens: number;
  output_tokens: number;
  speech_seconds: number;
}

export class CostGovernanceError extends Error {
  constructor(readonly status: 429 | 503, readonly category: 'daily_budget_exhausted' | 'cost_governance_unavailable', message: string) {
    super(message);
    this.name = 'CostGovernanceError';
  }
}

const safeInteger = (value: number) => Number.isSafeInteger(value) && value >= 0;
const emptyUsage = (): UsageRow => ({
  article_input_tokens: 0,
  article_output_tokens: 0,
  topic_input_tokens: 0,
  topic_output_tokens: 0,
  speech_seconds: 0,
});

export function shanghaiDay(timestamp: number) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextShanghaiReset(timestamp: number) {
  const local = new Date(timestamp + SHANGHAI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - SHANGHAI_OFFSET_MS).toISOString();
}

const cost = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export class CostGovernanceStore {
  readonly database: DatabaseSync;
  private readonly now: () => number;

  constructor(
    path: string,
    readonly limits: CostGovernanceLimits,
    readonly rates: CostEstimateRates = {},
    now: () => number = Date.now,
  ) {
    if (!path) throw new Error('Cost governance database path is required');
    for (const value of Object.values(limits)) if (!safeInteger(value)) throw new Error('Cost governance limits must be non-negative safe integers');
    for (const value of Object.values(rates)) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Cost estimate rates must be non-negative numbers');
    this.now = now;
    this.database = new DatabaseSync(path, { allowExtension: false });
    try {
      this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA trusted_schema = OFF; PRAGMA synchronous = FULL;');
      if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
      this.migrate();
      this.assertIntegrity();
      this.recoverReservations();
      this.prune();
    } catch (error) {
      if (this.database.isOpen) this.database.close();
      throw error;
    }
  }

  reserveAi(service: 'article_ai' | 'topic_ai', inputTokens: number, outputTokens: number): CostReservation {
    if (!safeInteger(inputTokens) || !safeInteger(outputTokens) || inputTokens + outputTokens < 1) {
      throw new Error('AI reservation must contain positive safe token units');
    }
    return this.protectedOperation(() => this.transaction(() => {
      const day = shanghaiDay(this.now());
      this.ensureDay(day);
      const usage = this.readUsage(day);
      const reserved = this.readReserved(day);
      const usedTokens = service === 'article_ai'
        ? usage.article_input_tokens + usage.article_output_tokens + reserved.article_input_tokens + reserved.article_output_tokens
        : usage.topic_input_tokens + usage.topic_output_tokens + reserved.topic_input_tokens + reserved.topic_output_tokens;
      const limit = service === 'article_ai' ? this.limits.articleAiDailyTokens : this.limits.topicAiDailyTokens;
      if (usedTokens + inputTokens + outputTokens > limit) throw exhausted(service);
      const reservation: CostReservation = { id: randomUUID(), day, service, inputTokens, outputTokens, speechSeconds: 0 };
      this.insertReservation(reservation);
      return reservation;
    }));
  }

  reserveSpeech(maxSeconds: number): CostReservation {
    if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1) throw new Error('Speech reservation must request positive whole seconds');
    return this.protectedOperation(() => this.transaction(() => {
      const day = shanghaiDay(this.now());
      this.ensureDay(day);
      const usage = this.readUsage(day);
      const reserved = this.readReserved(day);
      const remaining = this.limits.speechDailySeconds - usage.speech_seconds - reserved.speech_seconds;
      if (remaining < 1) throw exhausted('speech');
      const reservation: CostReservation = {
        id: randomUUID(), day, service: 'speech', inputTokens: 0, outputTokens: 0, speechSeconds: Math.min(maxSeconds, remaining),
      };
      this.insertReservation(reservation);
      return reservation;
    }));
  }

  settleAi(reservation: CostReservation, usage?: { input: number; output: number }) {
    const actual = usage && safeInteger(usage.input) && safeInteger(usage.output)
      ? { inputTokens: usage.input, outputTokens: usage.output }
      : { inputTokens: reservation.inputTokens, outputTokens: reservation.outputTokens };
    this.settle(reservation, { ...actual, speechSeconds: 0 });
  }

  settleSpeech(reservation: CostReservation, actualSeconds: number) {
    const seconds = safeInteger(actualSeconds) ? Math.min(reservation.speechSeconds, Math.max(1, actualSeconds)) : reservation.speechSeconds;
    this.settle(reservation, { inputTokens: 0, outputTokens: 0, speechSeconds: seconds });
  }

  release(reservation: CostReservation) {
    this.protectedOperation(() => this.transaction(() => {
      this.database.prepare('DELETE FROM cost_reservations WHERE id = ?').run(reservation.id);
    }));
  }

  snapshot(): CostGovernanceSnapshot {
    return this.protectedOperation(() => {
      const timestamp = this.now();
      const day = shanghaiDay(timestamp);
      const usage = this.readUsage(day);
      const reserved = this.readReserved(day);
      const articleUsed = usage.article_input_tokens + usage.article_output_tokens;
      const articleReserved = reserved.article_input_tokens + reserved.article_output_tokens;
      const topicUsed = usage.topic_input_tokens + usage.topic_output_tokens;
      const topicReserved = reserved.topic_input_tokens + reserved.topic_output_tokens;
      const aiEstimate = (input: number, output: number) => this.rates.deepseekInputCnyPerMillion === undefined || this.rates.deepseekOutputCnyPerMillion === undefined
        ? null
        : cost(input / 1_000_000 * this.rates.deepseekInputCnyPerMillion + output / 1_000_000 * this.rates.deepseekOutputCnyPerMillion);
      return {
        day,
        timezone: 'Asia/Shanghai',
        generatedAt: new Date(timestamp).toISOString(),
        resetsAt: nextShanghaiReset(timestamp),
        articleAi: {
          inputTokens: usage.article_input_tokens,
          outputTokens: usage.article_output_tokens,
          usedTokens: articleUsed,
          reservedTokens: articleReserved,
          limitTokens: this.limits.articleAiDailyTokens,
          remainingTokens: Math.max(0, this.limits.articleAiDailyTokens - articleUsed - articleReserved),
          estimatedCny: aiEstimate(usage.article_input_tokens, usage.article_output_tokens),
        },
        topicAi: {
          inputTokens: usage.topic_input_tokens,
          outputTokens: usage.topic_output_tokens,
          usedTokens: topicUsed,
          reservedTokens: topicReserved,
          limitTokens: this.limits.topicAiDailyTokens,
          remainingTokens: Math.max(0, this.limits.topicAiDailyTokens - topicUsed - topicReserved),
          estimatedCny: aiEstimate(usage.topic_input_tokens, usage.topic_output_tokens),
        },
        speech: {
          usedSeconds: usage.speech_seconds,
          reservedSeconds: reserved.speech_seconds,
          limitSeconds: this.limits.speechDailySeconds,
          remainingSeconds: Math.max(0, this.limits.speechDailySeconds - usage.speech_seconds - reserved.speech_seconds),
          estimatedCny: this.rates.tencentAsrCnyPerHour === undefined ? null : cost(usage.speech_seconds / 3600 * this.rates.tencentAsrCnyPerHour),
        },
      };
    });
  }

  close() {
    if (this.database.isOpen) this.database.close();
  }

  private migrate() {
    const version = Number((this.database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);
    if (version > SCHEMA_VERSION) throw new Error('Cost governance database schema is newer than this release');
    if (version === SCHEMA_VERSION) return;
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE cost_usage_days (
          day TEXT PRIMARY KEY CHECK (length(day) = 10),
          article_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (article_input_tokens >= 0),
          article_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (article_output_tokens >= 0),
          topic_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (topic_input_tokens >= 0),
          topic_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (topic_output_tokens >= 0),
          speech_seconds INTEGER NOT NULL DEFAULT 0 CHECK (speech_seconds >= 0)
        ) STRICT;
        CREATE TABLE cost_reservations (
          id TEXT PRIMARY KEY,
          day TEXT NOT NULL REFERENCES cost_usage_days(day) ON DELETE CASCADE,
          service TEXT NOT NULL CHECK (service IN ('article_ai','topic_ai','speech')),
          input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
          output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
          speech_seconds INTEGER NOT NULL CHECK (speech_seconds >= 0),
          CHECK ((service = 'speech' AND input_tokens = 0 AND output_tokens = 0 AND speech_seconds > 0)
            OR (service IN ('article_ai','topic_ai') AND input_tokens + output_tokens > 0 AND speech_seconds = 0))
        ) STRICT;
        PRAGMA user_version = 1;
      `);
    });
  }

  private assertIntegrity() {
    const result = this.database.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (result?.quick_check !== 'ok') throw new Error('Cost governance database integrity check failed');
  }

  private recoverReservations() {
    this.transaction(() => {
      const rows = this.database.prepare('SELECT * FROM cost_reservations').all() as unknown as ReservationRow[];
      for (const row of rows) {
        this.ensureDay(row.day);
        this.addUsage(row.day, row.service, row.input_tokens, row.output_tokens, row.speech_seconds);
      }
      this.database.exec('DELETE FROM cost_reservations');
    });
  }

  private prune() {
    const cutoff = shanghaiDay(this.now() - RETENTION_DAYS * 86_400_000);
    this.database.prepare('DELETE FROM cost_usage_days WHERE day < ? AND day NOT IN (SELECT day FROM cost_reservations)').run(cutoff);
  }

  private settle(reservation: CostReservation, actual: { inputTokens: number; outputTokens: number; speechSeconds: number }) {
    this.protectedOperation(() => this.transaction(() => {
      const row = this.database.prepare('SELECT * FROM cost_reservations WHERE id = ?').get(reservation.id) as ReservationRow | undefined;
      if (!row) return;
      this.addUsage(row.day, row.service, actual.inputTokens, actual.outputTokens, actual.speechSeconds);
      this.database.prepare('DELETE FROM cost_reservations WHERE id = ?').run(row.id);
    }));
  }

  private ensureDay(day: string) {
    this.database.prepare('INSERT OR IGNORE INTO cost_usage_days (day) VALUES (?)').run(day);
  }

  private readUsage(day: string): UsageRow {
    return (this.database.prepare('SELECT article_input_tokens, article_output_tokens, topic_input_tokens, topic_output_tokens, speech_seconds FROM cost_usage_days WHERE day = ?')
      .get(day) as UsageRow | undefined) ?? emptyUsage();
  }

  private readReserved(day: string): ReservedRow {
    return this.database.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN service = 'article_ai' THEN input_tokens ELSE 0 END), 0) AS article_input_tokens,
        COALESCE(SUM(CASE WHEN service = 'article_ai' THEN output_tokens ELSE 0 END), 0) AS article_output_tokens,
        COALESCE(SUM(CASE WHEN service = 'topic_ai' THEN input_tokens ELSE 0 END), 0) AS topic_input_tokens,
        COALESCE(SUM(CASE WHEN service = 'topic_ai' THEN output_tokens ELSE 0 END), 0) AS topic_output_tokens,
        COALESCE(SUM(CASE WHEN service = 'speech' THEN speech_seconds ELSE 0 END), 0) AS speech_seconds
      FROM cost_reservations WHERE day = ?
    `).get(day) as unknown as ReservedRow;
  }

  private insertReservation(value: CostReservation) {
    this.database.prepare(`INSERT INTO cost_reservations (id, day, service, input_tokens, output_tokens, speech_seconds) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(value.id, value.day, value.service, value.inputTokens, value.outputTokens, value.speechSeconds);
  }

  private addUsage(day: string, service: CostService, inputTokens: number, outputTokens: number, speechSeconds: number) {
    if (![inputTokens, outputTokens, speechSeconds].every(safeInteger)) throw new Error('Cost settlement contains invalid units');
    const columns = service === 'article_ai'
      ? ['article_input_tokens', 'article_output_tokens']
      : service === 'topic_ai' ? ['topic_input_tokens', 'topic_output_tokens'] : ['speech_seconds'];
    if (service === 'speech') {
      this.database.prepare(`UPDATE cost_usage_days SET ${columns[0]} = ${columns[0]} + ? WHERE day = ?`).run(speechSeconds, day);
    } else {
      this.database.prepare(`UPDATE cost_usage_days SET ${columns[0]} = ${columns[0]} + ?, ${columns[1]} = ${columns[1]} + ? WHERE day = ?`)
        .run(inputTokens, outputTokens, day);
    }
  }

  private transaction<T>(work: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.database.isOpen) this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private protectedOperation<T>(work: () => T): T {
    try { return work(); }
    catch (error) {
      if (error instanceof CostGovernanceError) throw error;
      throw new CostGovernanceError(503, 'cost_governance_unavailable', '用量保护暂不可用，请稍后再试。');
    }
  }
}

function exhausted(service: CostService) {
  const name = service === 'speech' ? '今日语音额度' : service === 'topic_ai' ? '今日话题 AI 额度' : '今日 AI 额度';
  return new CostGovernanceError(429, 'daily_budget_exhausted', `${name}已用完，请明天再试。`);
}
