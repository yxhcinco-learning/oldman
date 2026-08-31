import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TopicEditorialQueue } from './topic-catalog';
import { defaultOperationLogger, operationDuration, type OperationLogger } from './operations';

const querySchema = z.object({ kind: z.enum(['current', 'periodic', 'slow']).optional(), limit: z.coerce.number().int().min(1).max(20).default(20) }).strict();

export function registerTopics(app: FastifyInstance, options: { origin: string; queue?: TopicEditorialQueue; operations?: OperationLogger }) {
  const queue = options.queue ?? new TopicEditorialQueue();
  const log = options.operations ?? defaultOperationLogger;
  const originAllowed = (origin?: string) => !origin || origin === options.origin;
  app.get('/api/topics', async (request, reply) => {
    const startedAt = performance.now();
    if (!originAllowed(request.headers.origin)) {
      log({ requestId: request.id, action: 'topics.list', status: 403, durationMs: operationDuration(startedAt), errorCategory: 'origin_rejected' });
      return reply.code(403).send({ error: '来源不允许。' });
    }
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      log({ requestId: request.id, action: 'topics.list', status: 400, durationMs: operationDuration(startedAt), errorCategory: 'invalid_request' });
      return reply.code(400).send({ error: '议题查询无效。' });
    }
    const topics = queue.listPublished(parsed.data);
    log({ requestId: request.id, action: 'topics.list', status: 200, durationMs: operationDuration(startedAt) });
    return reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600').send({ updatedAt: new Date().toISOString(), topics });
  });
  app.get<{ Params: { id: string } }>('/api/topics/:id', async (request, reply) => {
    const startedAt = performance.now();
    if (!originAllowed(request.headers.origin)) {
      log({ requestId: request.id, action: 'topics.detail', status: 403, durationMs: operationDuration(startedAt), errorCategory: 'origin_rejected' });
      return reply.code(403).send({ error: '来源不允许。' });
    }
    const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96).safeParse(request.params.id);
    const topicValue = id.success ? queue.getPublished(id.data) : undefined;
    if (!topicValue) {
      log({ requestId: request.id, action: 'topics.detail', status: 404, durationMs: operationDuration(startedAt), errorCategory: 'not_found' });
      return reply.code(404).send({ error: '议题不存在或已停止发布。' });
    }
    log({ requestId: request.id, action: 'topics.detail', status: 200, durationMs: operationDuration(startedAt) });
    return reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600').send(topicValue);
  });
}
