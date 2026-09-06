import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import { z } from 'zod';
import { cloudIdSchema } from '../packages/core/src/cloud-protocol';
import { publicationSettingsInputSchema, submissionInputSchema, publicationActionSchema } from '../packages/core/src/publication-protocol';
import type { MiniIdentityStore } from './mini-identity-store';
import { MiniIdentityError } from './mini-identity-store';
import { PublicationStore } from './publication-store';
import { PublicationError } from './publication-errors';
import { COVER_UPLOAD_BYTES } from './publication-images';
import type { OperationLogger } from './operations';
import type { AuthenticatedTopicAdmin } from './topic-admin-auth';

const params = (request: FastifyRequest) => request.params as Record<string, string>;
const id = (request: FastifyRequest, field: string) => cloudIdSchema.parse(params(request)[field], { jitless: true });
const imageVariant = z.enum(['thumbnail', 'reading']);
const querySchema = z.object({ cursor: z.string().max(512).optional() }).strict();
const sendImage = (reply: FastifyReply, data: Buffer) => reply.type('image/jpeg').header('X-Content-Type-Options', 'nosniff').send(data);
function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof PublicationError) return reply.code(error.status).send({ code: error.code, error: error.message });
  if (error instanceof MiniIdentityError) return reply.code(401).send({ code: error.category,
    error: error.category === 'session_replaced' ? '已在其他设备登录，请主动登录后继续。' : '登录已失效，请重新登录。' });
  if (error instanceof z.ZodError) return reply.code(400).send({ code: 'invalid_publication_request', error: '提交内容无效，请检查后重试。' });
  return reply.code(503).send({ code: 'publication_unavailable', error: '文章服务暂不可用，请稍后重试。' });
}
export function registerPublicationApi(app: FastifyInstance, options: { identity?: MiniIdentityStore; store?: PublicationStore; operations: OperationLogger }) {
  const buckets = new Map<string, { minute: number; count: number }>();
  const consume = (key: string, limit: number) => {
    const minute = Math.floor(Date.now() / 60_000);
    if (buckets.size >= 2048) {
      for (const [k, value] of buckets) if (value.minute !== minute) buckets.delete(k);
      if (buckets.size >= 2048 && !buckets.has(key)) throw new PublicationError(429, 'rate_limited', '请求较频繁，请稍后重试。');
    }
    const old = buckets.get(key), next = old?.minute === minute ? old : { minute, count: 0 };
    buckets.set(key, next);
    if (++next.count > limit) throw new PublicationError(429, 'rate_limited', '请求较频繁，请稍后重试。');
  };
  type Handler = (request: FastifyRequest, reply: FastifyReply, token: string, store: PublicationStore) => unknown;
  const route = (method: HTTPMethods, url: string, action: string, handler: Handler, binary = false) => app.route({
    method, url, bodyLimit: binary ? COVER_UPLOAD_BYTES : 4096,
    handler: async (request, reply) => {
      const started = performance.now();
      reply.header('Cache-Control', 'no-store');
      try {
        if (!options.identity || !options.store) throw new PublicationError(503, 'publication_unavailable', '文章服务尚未配置。');
        consume('ip:' + request.ip, 300);
        const token = /^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(request.headers.authorization ?? '')?.[1];
        if (!token) throw new MiniIdentityError('invalid_session');
        const session = options.identity.authenticate(token, true);
        consume((binary ? 'upload:' : 'account:') + session.userId, binary ? 12 : 120);
        if (method !== 'GET' && request.headers['content-type']?.split(';')[0] !== (binary ? 'application/octet-stream' : 'application/json')) {
          throw new PublicationError(415, 'content_type', '请求格式不支持。');
        }
        return await handler(request, reply, token, options.store);
      } catch (error) { return fail(reply, error); }
      finally { options.operations({ requestId: request.id, action, status: reply.statusCode, durationMs: Math.round(performance.now() - started) }); }
    },
  });
  route('GET', '/api/mini/publications', 'publication.list', (_q, _r, token, store) => store.statuses(token));
  route('GET', '/api/mini/publications/:workId', 'publication.status', (q, _r, token, store) => store.status(token, id(q, 'workId')));
  route('POST', '/api/mini/publications/:workId/images/:assetId', 'publication.image.upload', (q, _r, token, store) => {
    if (!Buffer.isBuffer(q.body)) throw new PublicationError(400, 'invalid_cover', '请重新选择图片。');
    return store.upload(token, id(q, 'workId'), id(q, 'assetId'), q.body);
  }, true);
  route('GET', '/api/mini/publications/:workId/images/:assetId/:variant', 'publication.image.read', (q, reply, token, store) =>
    sendImage(reply, store.ownImage(token, id(q, 'workId'), id(q, 'assetId'), z.enum(['master', 'thumbnail', 'reading']).parse(params(q).variant))));
  route('PUT', '/api/mini/publications/:workId/settings', 'publication.settings', (q, _r, token, store) =>
    store.settings(token, id(q, 'workId'), publicationSettingsInputSchema.parse(q.body, { jitless: true })));
  route('GET', '/api/mini/publications/:workId/preview', 'publication.preview', (q, _r, token, store) => store.preview(token, id(q, 'workId')));
  route('POST', '/api/mini/publications/:workId/submissions', 'publication.submit', (q, _r, token, store) =>
    store.submit(token, id(q, 'workId'), submissionInputSchema.parse(q.body, { jitless: true })));
  route('GET', '/api/mini/publications/:workId/submissions/:submissionId', 'publication.submission.read', (q, _r, token, store) =>
    store.ownSubmission(token, id(q, 'workId'), id(q, 'submissionId')));
  route('POST', '/api/mini/publications/:workId/actions', 'publication.withdraw', (q, _r, token, store) =>
    store.withdraw(token, id(q, 'workId'), publicationActionSchema.parse(q.body, { jitless: true })));
  route('GET', '/api/mini/articles', 'article.list', (q, _r, token, store) => store.publicList(token, querySchema.parse(q.query).cursor));
  route('GET', '/api/mini/articles/:articleId', 'article.read', (q, _r, token, store) => store.publicArticle(token, id(q, 'articleId')));
  route('GET', '/api/mini/articles/:articleId/images/:variant', 'article.image', (q, reply, token, store) =>
    sendImage(reply, store.publicImage(token, id(q, 'articleId'), imageVariant.parse(params(q).variant))));
  if (options.store) {
    options.store.cleanup();
    const cleanup = setInterval(() => { try { options.store?.cleanup(); } catch { /* A later bounded cleanup retries; never expose database errors. */ } }, 3600_000);
    cleanup.unref();
    app.addHook('onClose', async () => { clearInterval(cleanup); });
  }
}

type AdminGuard = (request: FastifyRequest, reply: FastifyReply, mutate: boolean) => AuthenticatedTopicAdmin | undefined;
export function registerPublicationAdmin(app: FastifyInstance, store: PublicationStore | undefined, guard: AdminGuard, operations: OperationLogger) {
  const route = (method: HTTPMethods, url: string, action: string, handler: (request: FastifyRequest, reply: FastifyReply, store: PublicationStore) => unknown) => {
    app.route({ method, url, bodyLimit: 4096, handler: async (request, reply) => {
      const started = performance.now();
      reply.header('Cache-Control', 'no-store');
      try {
        if (!guard(request, reply, method !== 'GET')) return;
        if (!store) throw new PublicationError(503, 'publication_unavailable', '文章服务尚未配置。');
        return await handler(request, reply, store);
      } catch (error) { return fail(reply, error); }
      finally { operations({ requestId: request.id, action, status: reply.statusCode, durationMs: Math.round(performance.now() - started) }); }
    } });
  };
  route('GET', '/api/admin/articles', 'article.admin.list', (q, _r, store) => {
    const query = z.object({ state: z.enum(['pending', 'published', 'history']).default('pending'), cursor: z.coerce.number().int().nonnegative().max(100000).default(0) }).strict().parse(q.query);
    return store.adminList(query.state, query.cursor);
  });
  route('GET', '/api/admin/articles/:articleId/submissions/:submissionId', 'article.admin.read', (q, _r, store) => store.adminDetail(id(q, 'articleId'), id(q, 'submissionId')));
  route('GET', '/api/admin/articles/:articleId/submissions/:submissionId/images/:variant', 'article.admin.image', (q, reply, store) =>
    sendImage(reply, store.adminImage(id(q, 'articleId'), id(q, 'submissionId'), imageVariant.parse(params(q).variant))));
  route('GET', '/api/admin/articles/:articleId/audit', 'article.admin.audit', (q, _r, store) => ({ entries: store.audits(id(q, 'articleId')) }));
  route('POST', '/api/admin/articles/:articleId/actions', 'article.admin.review', (q, reply, store) =>
    store.adminAction(id(q, 'articleId'), () => {
      const admin = guard(q, reply, true);
      if (!admin) throw new PublicationError(reply.statusCode, 'admin_session_invalid', '后台会话已失效。');
      return admin.username;
    }, publicationActionSchema.parse(q.body, { jitless: true })));
}
