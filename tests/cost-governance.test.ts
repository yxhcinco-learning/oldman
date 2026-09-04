// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { CostGovernanceError, CostGovernanceStore, nextShanghaiReset, shanghaiDay } from '../server/cost-governance';
import { DEFAULT_COST_LIMITS, loadCostRuntime } from '../server/cost-runtime';

const directories: string[] = [];
const limits = { articleAiDailyTokens: 100, topicAiDailyTokens: 200, speechDailySeconds: 30 };

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function databasePath() {
  const directory = await mkdtemp(join(tmpdir(), 'suiyue-cost-'));
  directories.push(directory);
  return join(directory, 'usage.sqlite');
}

describe('cost runtime configuration', () => {
  it('uses ignored local defaults and requires explicit absolute production configuration', () => {
    expect(loadCostRuntime({}, 'fixture-workspace').configuration).toEqual({
      databasePath: resolve('fixture-workspace', '.data', 'usage.sqlite'), limits: DEFAULT_COST_LIMITS, rates: {},
    });
    expect(loadCostRuntime({ NODE_ENV: 'production' }).problem).toContain('路径未配置');
    expect(loadCostRuntime({ NODE_ENV: 'production', SUIYUE_USAGE_DB_PATH: 'relative.sqlite', ARTICLE_AI_DAILY_TOKEN_LIMIT: '1',
      TOPIC_AI_DAILY_TOKEN_LIMIT: '1', ASR_DAILY_SECONDS_LIMIT: '1' }).problem).toContain('路径无效');
    expect(loadCostRuntime({ NODE_ENV: 'production', SUIYUE_USAGE_DB_PATH: '/var/lib/suiyue-yousheng/usage.sqlite',
      ARTICLE_AI_DAILY_TOKEN_LIMIT: '0', TOPIC_AI_DAILY_TOKEN_LIMIT: '1100000', ASR_DAILY_SECONDS_LIMIT: '7200',
      DEEPSEEK_ESTIMATED_INPUT_CNY_PER_MILLION: '3.5', DEEPSEEK_ESTIMATED_OUTPUT_CNY_PER_MILLION: '9',
      TENCENT_ASR_ESTIMATED_CNY_PER_HOUR: '3.2' }).configuration).toEqual({
        databasePath: '/var/lib/suiyue-yousheng/usage.sqlite',
        limits: { articleAiDailyTokens: 0, topicAiDailyTokens: 1_100_000, speechDailySeconds: 7_200 },
        rates: { deepseekInputCnyPerMillion: 3.5, deepseekOutputCnyPerMillion: 9, tencentAsrCnyPerHour: 3.2 },
      });
  });

  it('rejects missing limits and malformed optional prices in production', () => {
    const base = { NODE_ENV: 'production', SUIYUE_USAGE_DB_PATH: '/var/lib/suiyue-yousheng/usage.sqlite',
      ARTICLE_AI_DAILY_TOKEN_LIMIT: '1', TOPIC_AI_DAILY_TOKEN_LIMIT: '2' };
    expect(loadCostRuntime(base).problem).toContain('上限');
    expect(loadCostRuntime({ ...base, ASR_DAILY_SECONDS_LIMIT: '3', DEEPSEEK_ESTIMATED_INPUT_CNY_PER_MILLION: '-1' }).problem).toContain('单价');
  });
});

describe('persistent cost governance store', () => {
  it('reserves atomically, settles actual usage and returns anonymous estimates', () => {
    const now = () => Date.parse('2026-09-04T08:00:00.000Z');
    const store = new CostGovernanceStore(':memory:', limits,
      { deepseekInputCnyPerMillion: 2, deepseekOutputCnyPerMillion: 8, tencentAsrCnyPerHour: 3.2 }, now);
    const first = store.reserveAi('article_ai', 40, 20);
    expect(store.snapshot().articleAi).toMatchObject({ usedTokens: 0, reservedTokens: 60, remainingTokens: 40 });
    expect(() => store.reserveAi('article_ai', 30, 11)).toThrowError(CostGovernanceError);
    store.settleAi(first, { input: 12, output: 8 });
    const speech = store.reserveSpeech(300);
    expect(speech.speechSeconds).toBe(30);
    store.settleSpeech(speech, 7);
    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({ day: '2026-09-04', timezone: 'Asia/Shanghai', resetsAt: '2026-09-04T16:00:00.000Z' });
    expect(snapshot.articleAi).toMatchObject({ inputTokens: 12, outputTokens: 8, usedTokens: 20, reservedTokens: 0, remainingTokens: 80 });
    expect(snapshot.articleAi.estimatedCny).toBe(0.000088);
    expect(snapshot.speech).toMatchObject({ usedSeconds: 7, reservedSeconds: 0, remainingSeconds: 23 });
    expect(snapshot.speech.estimatedCny).toBeCloseTo(0.006222, 6);
    expect(Object.keys(snapshot).sort()).toEqual(['articleAi', 'day', 'generatedAt', 'resetsAt', 'speech', 'timezone', 'topicAi']);
    store.close();
  });

  it('charges unknown completion and crash leftovers conservatively across restart', async () => {
    const path = await databasePath();
    const first = new CostGovernanceStore(path, limits, {}, () => Date.parse('2026-09-04T08:00:00Z'));
    const unknown = first.reserveAi('article_ai', 30, 20);
    first.settleAi(unknown);
    first.reserveAi('topic_ai', 80, 20);
    first.close();

    const reopened = new CostGovernanceStore(path, limits, {}, () => Date.parse('2026-09-04T09:00:00Z'));
    expect(reopened.snapshot().articleAi.usedTokens).toBe(50);
    expect(reopened.snapshot().topicAi).toMatchObject({ usedTokens: 100, reservedTokens: 0, remainingTokens: 100 });
    expect((reopened.database.prepare('SELECT COUNT(*) AS count FROM cost_reservations').get() as { count: number }).count).toBe(0);
    reopened.close();
  });

  it('switches at Shanghai midnight while a prior-day reservation settles to its original day', () => {
    let clock = Date.parse('2026-09-04T15:59:59Z');
    const store = new CostGovernanceStore(':memory:', limits, {}, () => clock);
    const reservation = store.reserveAi('article_ai', 20, 10);
    clock = Date.parse('2026-09-04T16:00:01Z');
    expect(store.snapshot()).toMatchObject({ day: '2026-09-05', resetsAt: '2026-09-05T16:00:00.000Z' });
    expect(store.snapshot().articleAi.usedTokens).toBe(0);
    store.settleAi(reservation, { input: 2, output: 1 });
    expect(store.snapshot().articleAi.usedTokens).toBe(0);
    expect(store.database.prepare('SELECT article_input_tokens, article_output_tokens FROM cost_usage_days WHERE day = ?').get('2026-09-04'))
      .toEqual({ article_input_tokens: 2, article_output_tokens: 1 });
    store.close();
  });

  it('rejects a future schema without rewriting it', async () => {
    const path = await databasePath();
    const database = new DatabaseSync(path);
    database.exec('CREATE TABLE untouched (id TEXT PRIMARY KEY) STRICT; PRAGMA user_version = 2;');
    database.close();
    expect(() => new CostGovernanceStore(path, limits)).toThrow(/newer/);
    const check = new DatabaseSync(path, { readOnly: true });
    expect(check.prepare('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name').all('table')).toEqual([{ name: 'untouched' }]);
    check.close();
  });

  it('keeps timezone helpers deterministic', () => {
    const before = Date.parse('2026-09-04T15:59:59.999Z');
    expect(shanghaiDay(before)).toBe('2026-09-04');
    expect(shanghaiDay(before + 1)).toBe('2026-09-05');
    expect(nextShanghaiReset(before)).toBe('2026-09-04T16:00:00.000Z');
  });
});
