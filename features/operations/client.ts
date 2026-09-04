import type { ProductEvent } from '../../lib/domain/operations';

export type OperationReporter = (event: ProductEvent) => void;

export const reportProductEvent: OperationReporter = event => {
  void fetch('/api/operations/events', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => undefined);
};
