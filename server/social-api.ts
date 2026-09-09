import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import { z } from 'zod';
import { cloudIdSchema } from '../packages/core/src/cloud-protocol';
import { socialMutationSchema, commentInputSchema, commentDeleteSchema, commentReportSchema, giftInputSchema,
  audienceInputSchema, commentReviewSchema, reportResolveSchema, socialEventSchema } from '../packages/core/src/social-protocol';
import { MiniIdentityError, type MiniIdentityStore } from './mini-identity-store';
import { PublicationError } from './publication-errors';
import type { SocialStore } from './social-store';
import type { OperationLogger } from './operations';
import type { AuthenticatedTopicAdmin } from './topic-admin-auth';

const id = (request: FastifyRequest, field: string) => cloudIdSchema.parse((request.params as Record<string, string>)[field], { jitless: true });
const cursorSchema = z.object({ cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict();
const cursor = (request: FastifyRequest) => cursorSchema.parse(request.query).cursor;
function fail(reply: FastifyReply, error: unknown) {
  reply.type('application/json');
  if (error instanceof PublicationError) return reply.code(error.status).send({ code: error.code, error: error.message });
  if (error instanceof MiniIdentityError) return reply.code(401).send({ code: error.category,
    error: error.category === 'session_replaced' ? '已在其他设备登录，请主动登录后继续。' : '登录已失效，请重新登录。' });
  if (error instanceof z.ZodError) return reply.code(400).send({ code: 'invalid_social_request', error: '提交内容无效，请检查后重试。' });
  return reply.code(503).send({ code: 'social_unavailable', error: '互动服务暂不可用，请稍后重试。' });
}
export function registerSocialApi(app: FastifyInstance, options: { store?: SocialStore; identity?: MiniIdentityStore; operations: OperationLogger }) {
  const buckets = new Map<string, { minute: number; count: number }>();
  const consume = (key: string, limit: number) => {
    const minute = Math.floor(Date.now() / 60_000);
    if (buckets.size >= 4096) {
      for (const [k, value] of buckets) if (value.minute !== minute) buckets.delete(k);
      if (buckets.size >= 4096 && !buckets.has(key)) throw new PublicationError(429, 'rate_limited', '请求较频繁，请稍后重试。');
    }
    const next = buckets.get(key)?.minute === minute ? buckets.get(key)! : { minute, count: 0 };
    buckets.set(key, next); if (++next.count > limit) throw new PublicationError(429, 'rate_limited', '请求较频繁，请稍后重试。');
  };
  type Handler = (request: FastifyRequest, reply: FastifyReply, store: SocialStore, token: string) => unknown;
  const route = (method: HTTPMethods, url: string, action: string, publicRead: boolean, handler: Handler, limit = 60) => app.route({ method, url, bodyLimit: 4096,
    handler: async (request, reply) => {
      const started = performance.now(); reply.header('Cache-Control', 'no-store');
      try {
        if (!options.store || !options.identity) throw new PublicationError(503, 'social_unavailable', '互动服务尚未配置。');
        const publicEvent = publicRead && action === 'social.event';
        consume((publicEvent ? 'public-event:' : publicRead ? 'public:' : 'protected:') + request.ip, publicEvent ? 30 : publicRead ? 180 : 300);
        let token = '';
        if (publicRead) {
          // Public routes never interpret a supplied token or silently downgrade an expired account.
          if (request.headers.authorization) throw new PublicationError(400, 'public_token_forbidden', '请使用对应的账号阅读入口。');
        } else {
          token = /^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(request.headers.authorization ?? '')?.[1] ?? '';
          const session = options.identity.authenticate(token, true);
          consume('account:' + session.userId, 180);
          if (method !== 'GET') consume(action + ':' + session.userId, limit);
        }
        if (method !== 'GET' && request.headers['content-type']?.split(';')[0] !== 'application/json') throw new PublicationError(415, 'content_type', '请求格式不支持。');
        return await handler(request, reply, options.store, token);
      } catch (error) { return fail(reply, error); }
      finally { options.operations({ requestId: request.id, action, status: reply.statusCode, durationMs: Math.round(performance.now() - started) }); }
    } });
  route('GET', '/api/public/articles/:articleId', 'social.public.article', true, (q, _r, s) => { cursorSchema.omit({ cursor: true }).parse(q.query); return s.article(id(q, 'articleId')); });
  route('GET', '/api/public/articles/:articleId/images/:variant', 'social.public.image', true, (q, r, s) =>
    r.type('image/jpeg').header('X-Content-Type-Options', 'nosniff').send(s.image(id(q, 'articleId'), z.enum(['thumbnail', 'reading']).parse((q.params as Record<string, string>).variant))));
  for (const audience of ['public', 'mini'] as const) {
    const publicRead = audience === 'public';
    route('GET', `/api/${audience}/articles/:articleId/comments`, 'social.comments', publicRead, (q, _r, s, t) => s.comments(id(q, 'articleId'), publicRead ? undefined : t, cursor(q)));
    route('GET', `/api/${audience}/authors/:authorId`, 'social.author', publicRead, (q, _r, s, t) => { z.object({}).strict().parse(q.query); return s.author(id(q, 'authorId'), publicRead ? undefined : t); });
    route('GET', `/api/${audience}/authors/:authorId/articles`, 'social.author.articles', publicRead, (q, _r, s, t) => s.authorArticles(id(q, 'authorId'), publicRead ? undefined : t, cursor(q)));
    route('POST', `/api/${audience}/social/events`, 'social.event', publicRead, (q, _r, s, t) => s.event(socialEventSchema.parse(q.body), publicRead ? undefined : t), 30);
  }
  route('GET', '/api/mini/articles/:articleId/engagement', 'social.engagement', false, (q, _r, s, t) => { z.object({}).strict().parse(q.query); return s.engagement(t, id(q, 'articleId')); });
  for (const kind of ['like', 'collection'] as const) route('PUT', `/api/mini/articles/:articleId/${kind}`, 'social.' + kind, false,
    (q, _r, s, t) => s.reaction(t, id(q, 'articleId'), kind, socialMutationSchema.parse(q.body)), 60);
  route('PUT', '/api/mini/authors/:authorId/follow', 'social.follow', false, (q, _r, s, t) => s.follow(t, id(q, 'authorId'), socialMutationSchema.parse(q.body)));
  route('POST', '/api/mini/articles/:articleId/comments', 'social.comment.submit', false, (q, _r, s, t) => s.submitComment(t, id(q, 'articleId'), commentInputSchema.parse(q.body)), 6);
  route('POST', '/api/mini/comments/:commentId/delete', 'social.comment.delete', false, (q, _r, s, t) => s.deleteComment(t, id(q, 'commentId'), commentDeleteSchema.parse(q.body)), 30);
  route('POST', '/api/mini/comments/:commentId/reports', 'social.comment.report', false, (q, _r, s, t) => s.report(t, id(q, 'commentId'), commentReportSchema.parse(q.body)), 6);
  route('POST', '/api/mini/articles/:articleId/gifts', 'social.gift', false, (q, _r, s, t) => s.gift(t, id(q, 'articleId'), giftInputSchema.parse(q.body)), 30);
  route('GET', '/api/mini/me/flowers', 'social.flowers', false, (q, _r, s, t) => { z.object({}).strict().parse(q.query); return s.flowers(t); });
  route('GET', '/api/mini/me/social', 'social.summary', false, (q, _r, s, t) => { z.object({}).strict().parse(q.query); return s.summary(t); });
  route('POST', '/api/mini/me/flowers/claim', 'social.flowers.claim', false, (q, _r, s, t) => { z.object({}).strict().parse(q.body); return s.claim(t); }, 30);
  route('GET', '/api/mini/me/flowers/history', 'social.flowers.history', false, (q, _r, s, t) => s.flowerHistory(t, cursor(q)));
  route('GET', '/api/mini/me/collections', 'social.collections', false, (q, _r, s, t) => s.collections(t, cursor(q)));
  for (const kind of ['following', 'followers', 'mutuals'] as const) route('GET', `/api/mini/me/${kind}`, 'social.' + kind, false, (q, _r, s, t) => s.relationships(t, kind, cursor(q)));
  route('PUT', '/api/mini/publications/:workId/audience', 'social.audience', false, (q, _r, s, t) => s.audience(t, id(q, 'workId'), audienceInputSchema.parse(q.body)), 30);
  if (options.store) {
    options.store.cleanup(); const timer = setInterval(() => { try { options.store?.cleanup(); } catch { /* Retry on the next bounded maintenance interval. */ } }, 3600_000);
    timer.unref(); app.addHook('onClose', async () => { clearInterval(timer); });
  }
}
type AdminGuard = (request: FastifyRequest, reply: FastifyReply, mutate: boolean) => AuthenticatedTopicAdmin | undefined;
export function registerSocialAdmin(app: FastifyInstance, store: SocialStore | undefined, guard: AdminGuard, operations: OperationLogger) {
  const route = (method: HTTPMethods, url: string, handler: (q: FastifyRequest, s: SocialStore, actor: () => string) => unknown) => app.route({ method, url, bodyLimit: 4096,
    handler: async (request, reply) => {
      const started = performance.now(); reply.header('Cache-Control', 'no-store');
      try {
        if (!guard(request, reply, method !== 'GET')) return;
        if (!store) throw new PublicationError(503, 'social_unavailable', '互动服务尚未配置。');
        return handler(request, store, () => { const admin = guard(request, reply, true); if (!admin) throw new PublicationError(reply.statusCode, 'admin_session_invalid', '后台会话已失效。'); return admin.username; });
      } catch (error) { return fail(reply, error); }
      finally { operations({ requestId: request.id, action: 'social.admin.' + (method === 'GET' ? 'read' : 'write'), status: reply.statusCode, durationMs: Math.round(performance.now() - started) }); }
    } });
  route('GET', '/api/admin/comments', (q, s) => { const query = cursorSchema.extend({ state: z.enum(['pending', 'approved', 'rejected', 'hidden', 'deleted']).default('pending') }).parse(q.query); return s.adminComments(query.state, query.cursor); });
  route('GET', '/api/admin/comments/:commentId', (q, s) => s.adminDetail(id(q, 'commentId')));
  route('GET', '/api/admin/comments/:commentId/audit', (q, s) => ({ entries: s.audits(id(q, 'commentId')) }));
  route('POST', '/api/admin/comments/:commentId/actions', (q, s, actor) => s.adminReview(id(q, 'commentId'), actor, commentReviewSchema.parse(q.body)));
  route('GET', '/api/admin/comment-reports', (q, s) => { const query = cursorSchema.extend({ state: z.enum(['pending', 'resolved']).default('pending') }).parse(q.query); return s.adminReports(query.state, query.cursor); });
  route('POST', '/api/admin/comment-reports/:reportId/resolve', (q, s, actor) => s.resolveReport(id(q, 'reportId'), actor, reportResolveSchema.parse(q.body)));
  route('GET', '/api/admin/social/metrics', (_q, s) => s.metrics());
}
