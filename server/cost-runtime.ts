import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, posix, resolve, win32 } from 'node:path';
import { CostGovernanceStore, type CostEstimateRates, type CostGovernanceLimits } from './cost-governance';

export const DEFAULT_PRODUCTION_USAGE_DB_PATH = '/var/lib/suiyue-yousheng/usage.sqlite';
export const DEFAULT_COST_LIMITS: CostGovernanceLimits = {
  articleAiDailyTokens: 1_000_000,
  topicAiDailyTokens: 1_100_000,
  speechDailySeconds: 7_200,
};

export interface CostRuntimeConfiguration {
  databasePath: string;
  limits: CostGovernanceLimits;
  rates: CostEstimateRates;
}

export interface CostRuntimeLoad {
  configuration?: CostRuntimeConfiguration;
  problem?: string;
}

const absolutePath = (value: string) => isAbsolute(value) || posix.isAbsolute(value) || win32.isAbsolute(value);
const wholeNumber = (value: string | undefined, fallback: number | undefined, maximum: number) => {
  const raw = value?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : undefined;
};
const decimal = (value: string | undefined) => {
  const raw = value?.trim();
  if (!raw) return { valid: true, value: undefined };
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(raw)) return { valid: false, value: undefined };
  const parsed = Number(raw);
  return { valid: Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000, value: parsed };
};

export function loadCostRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd = process.cwd(),
): CostRuntimeLoad {
  const production = env.NODE_ENV === 'production';
  const configuredPath = env.SUIYUE_USAGE_DB_PATH?.trim();
  if (production && !configuredPath) return { problem: '用量数据库路径未配置，AI 与语音已关闭。' };
  if (configuredPath && (!absolutePath(configuredPath) && production || /[\u0000-\u001f\u007f]/.test(configuredPath))) {
    return { problem: '用量数据库路径无效，AI 与语音已关闭。' };
  }
  const fallback = production ? undefined : DEFAULT_COST_LIMITS;
  const articleAiDailyTokens = wholeNumber(env.ARTICLE_AI_DAILY_TOKEN_LIMIT, fallback?.articleAiDailyTokens, 1_000_000_000);
  const topicAiDailyTokens = wholeNumber(env.TOPIC_AI_DAILY_TOKEN_LIMIT, fallback?.topicAiDailyTokens, 1_000_000_000);
  const speechDailySeconds = wholeNumber(env.ASR_DAILY_SECONDS_LIMIT, fallback?.speechDailySeconds, 31_536_000);
  if (articleAiDailyTokens === undefined || topicAiDailyTokens === undefined || speechDailySeconds === undefined) {
    return { problem: '每日 AI 或语音上限缺失或无效，付费能力已关闭。' };
  }
  const inputRate = decimal(env.DEEPSEEK_ESTIMATED_INPUT_CNY_PER_MILLION);
  const outputRate = decimal(env.DEEPSEEK_ESTIMATED_OUTPUT_CNY_PER_MILLION);
  const speechRate = decimal(env.TENCENT_ASR_ESTIMATED_CNY_PER_HOUR);
  if (!inputRate.valid || !outputRate.valid || !speechRate.valid) return { problem: '费用估算单价无效，付费能力已关闭。' };
  const databasePath = configuredPath
    ? (absolutePath(configuredPath) ? configuredPath : resolve(cwd, configuredPath))
    : resolve(cwd, '.data', 'usage.sqlite');
  return {
    configuration: {
      databasePath,
      limits: { articleAiDailyTokens, topicAiDailyTokens, speechDailySeconds },
      rates: {
        ...(inputRate.value === undefined ? {} : { deepseekInputCnyPerMillion: inputRate.value }),
        ...(outputRate.value === undefined ? {} : { deepseekOutputCnyPerMillion: outputRate.value }),
        ...(speechRate.value === undefined ? {} : { tencentAsrCnyPerHour: speechRate.value }),
      },
    },
  };
}

export function createCostRuntime(configuration: CostRuntimeConfiguration) {
  mkdirSync(dirname(configuration.databasePath), { recursive: true });
  const store = new CostGovernanceStore(configuration.databasePath, configuration.limits, configuration.rates);
  return { store, close: () => store.close() };
}
