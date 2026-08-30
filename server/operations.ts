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

export const defaultOperationLogger: OperationLogger = entry => {
  if (process.env.NODE_ENV === 'test') return;
  try {
    console.info(JSON.stringify(entry));
  } catch {
    // Operational logging must never change an API result or expose fallback data.
  }
};

export const operationDuration = (startedAt: number) => Math.max(0, Math.round(performance.now() - startedAt));
