import { DEFAULT_CLOUD_LIMITS } from './cloud-work-store';

export function loadCloudRuntime(env: NodeJS.ProcessEnv = process.env) {
  const integer = (key: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) => {
    if (env[key] === undefined || env[key] === '') return fallback;
    const value = Number(env[key]);
    if (!/^[1-9]\d*$/.test(env[key]!) || !Number.isSafeInteger(value) || value > maximum) throw new Error(`${key} must be a positive integer no greater than ${maximum}`);
    return value;
  };
  return {
    cloudWorkLimits: {
      maxWorkBytes: integer('CLOUD_WORK_MAX_BYTES', DEFAULT_CLOUD_LIMITS.maxWorkBytes, DEFAULT_CLOUD_LIMITS.maxWorkBytes),
      maxAccountBytes: integer('CLOUD_ACCOUNT_MAX_BYTES', DEFAULT_CLOUD_LIMITS.maxAccountBytes),
      maxWorks: integer('CLOUD_ACCOUNT_MAX_WORKS', DEFAULT_CLOUD_LIMITS.maxWorks),
    },
    accountRequestsPerMinute: integer('CLOUD_ACCOUNT_REQUESTS_PER_MINUTE', 120, 10000),
  };
}
