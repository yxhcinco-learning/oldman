import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { REVIEWED_TOPIC_CATALOG } from './topic-catalog';
import { TopicStore } from './topic-store';

export const DEFAULT_PRODUCTION_TOPIC_DB_PATH = '/var/lib/suiyue-yousheng/topics.sqlite';

export interface TopicRuntimeConfiguration {
  databasePath: string;
}

export interface TopicRuntimeLoad {
  configuration?: TopicRuntimeConfiguration;
  problem?: string;
}

export function loadTopicRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd = process.cwd(),
): TopicRuntimeLoad {
  const configuredPath = env.SUIYUE_TOPICS_DB_PATH?.trim();
  const production = env.NODE_ENV === 'production';
  if (!configuredPath && production) {
    return { problem: '话题数据库路径未配置，热门与后台已关闭。' };
  }
  if (production && configuredPath && !isAbsolute(configuredPath)) {
    return { problem: '话题数据库路径必须是绝对路径，热门与后台已关闭。' };
  }
  const databasePath = configuredPath
    ? (isAbsolute(configuredPath) ? configuredPath : resolve(cwd, configuredPath))
    : resolve(cwd, '.data', 'topics.sqlite');
  return { configuration: { databasePath } };
}

export function createTopicRuntime(configuration: TopicRuntimeConfiguration) {
  mkdirSync(dirname(configuration.databasePath), { recursive: true });
  const store = new TopicStore({ path: configuration.databasePath, seed: REVIEWED_TOPIC_CATALOG });
  return { store, close: () => store.close() };
}
