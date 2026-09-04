import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TopicStore } from './topic-store';
import { defaultOperationLogger, operationDuration, type OperationLogger } from './operations';

const querySchema = z.object({ kind: z.enum(['current', 'periodic', 'slow']).optional(), limit: z.coerce.number().int().min(1).max(5).default(5) }).strict();

export function registerTopics(app: FastifyInstance, options: { origin: string; store?: TopicStore; operations?: OperationLogger }) {
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
    if (!options.store) {
      log({ requestId: request.id, action: 'topics.list', status: 503, durationMs: operationDuration(startedAt), errorCategory: 'topics_unavailable' });
      return reply.code(503).send({ error: '热门内容暂时不可用，本机写作仍可继续。' });
    }
    let topics;
    try { topics = options.store.listHome(parsed.data); }
    catch {
      log({ requestId: request.id, action: 'topics.list', status: 503, durationMs: operationDuration(startedAt), errorCategory: 'topics_unavailable' });
      return reply.code(503).send({ error: '热门内容暂时不可用，本机写作仍可继续。' });
    }
    log({ requestId: request.id, action: 'topics.list', status: 200, durationMs: operationDuration(startedAt) });
    return reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120').send({ updatedAt: new Date().toISOString(), topics });
  });
  app.get<{ Params: { id: string } }>('/api/topics/:id', async (request, reply) => {
    const startedAt = performance.now();
    if (!originAllowed(request.headers.origin)) {
      log({ requestId: request.id, action: 'topics.detail', status: 403, durationMs: operationDuration(startedAt), errorCategory: 'origin_rejected' });
      return reply.code(403).send({ error: '来源不允许。' });
    }
    if (!options.store) {
      log({ requestId: request.id, action: 'topics.detail', status: 503, durationMs: operationDuration(startedAt), errorCategory: 'topics_unavailable' });
      return reply.code(503).send({ error: '热门内容暂时不可用，本机写作仍可继续。' });
    }
    const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96).safeParse(request.params.id);
    let topicValue;
    try { topicValue = id.success ? options.store.getPublished(id.data) : undefined; }
    catch {
      log({ requestId: request.id, action: 'topics.detail', status: 503, durationMs: operationDuration(startedAt), errorCategory: 'topics_unavailable' });
      return reply.code(503).send({ error: '热门内容暂时不可用，本机写作仍可继续。' });
    }
    if (!topicValue) {
      log({ requestId: request.id, action: 'topics.detail', status: 404, durationMs: operationDuration(startedAt), errorCategory: 'not_found' });
      return reply.code(404).send({ error: '议题不存在或已停止发布。' });
    }
    log({ requestId: request.id, action: 'topics.detail', status: 200, durationMs: operationDuration(startedAt) });
    return reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120').send(topicValue);
  });
}
