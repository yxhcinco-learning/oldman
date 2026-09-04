import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { productEvents, type ProductEvent } from '../lib/domain/operations';
import { defaultOperationLogger, operationDuration, type OperationLogger } from './operations';

export const productEventSchema = z.enum(productEvents);

const eventRequestSchema = z.object({ event: productEventSchema }).strict();
const contentTypeIsJson = (request: FastifyRequest) => request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() === 'application/json';

export interface OperationalEventOptions {
  origin: string;
  operations?: OperationLogger;
  now?: () => number;
  requestsPerMinute?: number;
}

export function registerOperationalEvents(app: FastifyInstance, options: OperationalEventOptions) {
  const operations = options.operations ?? defaultOperationLogger;
  const clock = options.now ?? Date.now;
  const limit = options.requestsPerMinute ?? 120;
  let bucket = { minute: Math.floor(clock() / 60_000), count: 0 };

  app.post('/api/operations/events', { bodyLimit: 256 }, async (request, reply) => {
    const startedAt = performance.now();
    const finish = (status: number, errorCategory?: string, event?: ProductEvent) => operations({
      requestId: request.id,
      action: event ? `event.${event}` : 'event.report',
      status,
      durationMs: operationDuration(startedAt),
      ...(errorCategory ? { errorCategory } : {}),
    });
    if (request.headers.origin !== options.origin) {
      finish(403, 'origin_rejected');
      return reply.code(403).send({ error: '来源不允许。' });
    }
    if (!contentTypeIsJson(request)) {
      finish(415, 'content_type');
      return reply.code(415).send({ error: '事件入口只接受 JSON。' });
    }
    const minute = Math.floor(clock() / 60_000);
    if (minute !== bucket.minute) bucket = { minute, count: 0 };
    bucket.count += 1;
    if (bucket.count > limit) {
      finish(429, 'rate_limited');
      return reply.code(429).send({ error: '事件请求过于频繁。' });
    }
    const parsed = eventRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      finish(400, 'invalid_event');
      return reply.code(400).send({ error: '事件无效。' });
    }
    finish(204, undefined, parsed.data.event);
    return reply.code(204).send();
  });
}
