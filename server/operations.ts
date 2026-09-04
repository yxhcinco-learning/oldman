export interface OperationTokens {
  input: number;
  output: number;
}

export interface OperationEntry {
  requestId: string;
  action: string;
  status: number;
  durationMs: number;
  tokens?: OperationTokens;
  errorCategory?: string;
}

export type OperationLogger = (entry: OperationEntry) => void;

export interface OperationMetric {
  requests: number;
  successes: number;
  clientErrors: number;
  serverErrors: number;
  inputTokens: number;
  outputTokens: number;
  averageDurationMs: number;
  p95DurationMs: number;
  errors: Record<string, number>;
}

export interface OperationActionMetric extends OperationMetric {
  action: string;
  lastSeenAt: string;
}

export interface OperationMonitorSnapshot {
  startedAt: string;
  generatedAt: string;
  uptimeSeconds: number;
  lifetime: OperationMetric;
  last15Minutes: OperationMetric;
  last60Minutes: OperationMetric;
  actions: OperationActionMetric[];
}

interface MetricAccumulator {
  requests: number;
  successes: number;
  clientErrors: number;
  serverErrors: number;
  inputTokens: number;
  outputTokens: number;
  durationTotalMs: number;
  latencyBuckets: number[];
  errors: Map<string, number>;
}

interface ActionAccumulator extends MetricAccumulator {
  lastSeenAt: number;
}

const LATENCY_BOUNDS = [10, 50, 100, 250, 500, 1_000, 3_000, 10_000, 30_000] as const;
const SAFE_NAME = /^[a-z][a-z0-9.-]{0,63}$/;
const SAFE_ERROR_CATEGORY = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_ACTIONS = 128;
const MAX_ERRORS_PER_METRIC = 32;

const emptyMetric = (): MetricAccumulator => ({
  requests: 0,
  successes: 0,
  clientErrors: 0,
  serverErrors: 0,
  inputTokens: 0,
  outputTokens: 0,
  durationTotalMs: 0,
  latencyBuckets: LATENCY_BOUNDS.map(() => 0),
  errors: new Map(),
});

const addMetric = (target: MetricAccumulator, source: MetricAccumulator) => {
  target.requests += source.requests;
  target.successes += source.successes;
  target.clientErrors += source.clientErrors;
  target.serverErrors += source.serverErrors;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.durationTotalMs += source.durationTotalMs;
  source.latencyBuckets.forEach((count, index) => { target.latencyBuckets[index] += count; });
  for (const [category, count] of source.errors) target.errors.set(category, (target.errors.get(category) ?? 0) + count);
};

const percentile95 = (metric: MetricAccumulator) => {
  if (!metric.requests) return 0;
  const target = Math.ceil(metric.requests * 0.95);
  let seen = 0;
  for (let index = 0; index < LATENCY_BOUNDS.length; index += 1) {
    seen += metric.latencyBuckets[index];
    if (seen >= target) return LATENCY_BOUNDS[index];
  }
  return LATENCY_BOUNDS.at(-1) ?? 0;
};

const publicMetric = (metric: MetricAccumulator): OperationMetric => ({
  requests: metric.requests,
  successes: metric.successes,
  clientErrors: metric.clientErrors,
  serverErrors: metric.serverErrors,
  inputTokens: metric.inputTokens,
  outputTokens: metric.outputTokens,
  averageDurationMs: metric.requests ? Math.round(metric.durationTotalMs / metric.requests) : 0,
  p95DurationMs: percentile95(metric),
  errors: Object.fromEntries([...metric.errors.entries()].sort(([left], [right]) => left.localeCompare(right))),
});

const recordMetric = (metric: MetricAccumulator, entry: OperationEntry) => {
  metric.requests += 1;
  if (entry.status < 400) metric.successes += 1;
  else if (entry.status < 500) metric.clientErrors += 1;
  else metric.serverErrors += 1;
  metric.inputTokens += Math.max(0, Math.round(entry.tokens?.input ?? 0));
  metric.outputTokens += Math.max(0, Math.round(entry.tokens?.output ?? 0));
  const duration = Math.min(LATENCY_BOUNDS.at(-1) ?? 30_000, Math.max(0, Math.round(entry.durationMs)));
  metric.durationTotalMs += duration;
  const latencyIndex = LATENCY_BOUNDS.findIndex(bound => duration <= bound);
  metric.latencyBuckets[latencyIndex < 0 ? LATENCY_BOUNDS.length - 1 : latencyIndex] += 1;
  if (entry.errorCategory && SAFE_ERROR_CATEGORY.test(entry.errorCategory)) {
    if (metric.errors.has(entry.errorCategory) || metric.errors.size < MAX_ERRORS_PER_METRIC) {
      metric.errors.set(entry.errorCategory, (metric.errors.get(entry.errorCategory) ?? 0) + 1);
    }
  }
};

export class OperationMonitor {
  readonly startedAt: number;
  private readonly lifetime = emptyMetric();
  private readonly minutes = new Map<number, MetricAccumulator>();
  private readonly actions = new Map<string, ActionAccumulator>();

  constructor(private readonly clock: () => number = Date.now) {
    this.startedAt = clock();
  }

  record(entry: OperationEntry) {
    if (!SAFE_NAME.test(entry.action)) return;
    const now = this.clock();
    const minute = Math.floor(now / 60_000);
    this.prune(minute);
    recordMetric(this.lifetime, entry);
    const minuteMetric = this.minutes.get(minute) ?? emptyMetric();
    recordMetric(minuteMetric, entry);
    this.minutes.set(minute, minuteMetric);
    let action = this.actions.get(entry.action);
    if (!action && this.actions.size < MAX_ACTIONS) {
      action = { ...emptyMetric(), lastSeenAt: now };
      this.actions.set(entry.action, action);
    }
    if (action) {
      recordMetric(action, entry);
      action.lastSeenAt = now;
    }
  }

  snapshot(): OperationMonitorSnapshot {
    const now = this.clock();
    const minute = Math.floor(now / 60_000);
    this.prune(minute);
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      generatedAt: new Date(now).toISOString(),
      uptimeSeconds: Math.max(0, Math.floor((now - this.startedAt) / 1_000)),
      lifetime: publicMetric(this.lifetime),
      last15Minutes: publicMetric(this.window(minute, 15)),
      last60Minutes: publicMetric(this.window(minute, 60)),
      actions: [...this.actions.entries()]
        .map(([actionName, metric]) => ({ action: actionName, lastSeenAt: new Date(metric.lastSeenAt).toISOString(), ...publicMetric(metric) }))
        .sort((left, right) => right.requests - left.requests || left.action.localeCompare(right.action)),
    };
  }

  private prune(currentMinute: number) {
    for (const minute of this.minutes.keys()) if (minute < currentMinute - 59) this.minutes.delete(minute);
  }

  private window(currentMinute: number, length: number) {
    const result = emptyMetric();
    for (const [minute, metric] of this.minutes) if (minute >= currentMinute - length + 1) addMetric(result, metric);
    return result;
  }
}

export const defaultOperationLogger: OperationLogger = entry => {
  if (process.env.NODE_ENV === 'test') return;
  try {
    console.info(JSON.stringify(entry));
  } catch {
    // Operational logging must never change an API result or expose fallback data.
  }
};

export const operationDuration = (startedAt: number) => Math.max(0, Math.round(performance.now() - startedAt));
