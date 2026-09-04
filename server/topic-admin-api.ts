import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { topicEditableContentSchema, topicPlacementSchema, writingTopicSchema } from '../lib/domain/topics';
import { defaultOperationLogger, operationDuration, type OperationLogger } from './operations';
import { TopicAdminAuthError, TopicAdminAuthService, type AuthenticatedTopicAdmin } from './topic-admin-auth';
import { TopicStore, TopicStoreError } from './topic-store';

const SESSION_COOKIE = 'suiyue_topic_admin';
const CSRF_COOKIE = 'suiyue_topic_csrf';
const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96);
const revisionSchema = z.coerce.number().int().positive();
const listQuerySchema = z.object({
  status: z.enum(['draft', 'candidate', 'rejected', 'published', 'corrected', 'archived']).optional(),
  kind: z.enum(['current', 'periodic', 'slow']).optional(),
  query: z.string().trim().max(120).optional(),
}).strict();
const loginSchema = z.object({ username: z.string().max(128), password: z.string().max(1024) }).strict();
const createSchema = z.object({
  id: idSchema.optional(), status: z.enum(['draft', 'candidate']).default('draft'), editorBrief: z.string().max(6000).default(''),
  content: topicEditableContentSchema,
}).strict();
const updateSchema = z.object({ content: topicEditableContentSchema }).strict();
const publishSchema = z.object({ slot: z.number().int().min(1).max(5), startsAt: z.iso.datetime(), endsAt: z.iso.datetime().nullable() }).strict();
const placementWriteSchema = z.object({
  placementId: z.string().uuid().optional(), topicId: idSchema, revision: z.number().int().positive(),
  startsAt: z.iso.datetime(), endsAt: z.iso.datetime().nullable(),
}).strict();
const placementDeleteSchema = z.object({ placementId: z.string().uuid() }).strict();
const emptySchema = z.object({}).strict();

interface RateBucket { startedAt: number; count: number }

export interface TopicAdminGatewayOptions {
  origin: string;
  store?: TopicStore;
  auth?: TopicAdminAuthService;
  operations?: OperationLogger;
  now?: () => number;
  loginAttemptsPerWindow?: number;
  loginWindowMs?: number;
}

const contentTypeIsJson = (request: FastifyRequest) => request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
const readCookies = (header: string | undefined) => Object.fromEntries((header ?? '').split(';').map(value => value.trim()).filter(Boolean).map(value => {
  const separator = value.indexOf('=');
  if (separator < 0) return [value, ''];
  try { return [value.slice(0, separator), decodeURIComponent(value.slice(separator + 1))]; }
  catch { return [value.slice(0, separator), '']; }
}));
const cookieValue = (request: FastifyRequest) => readCookies(request.headers.cookie)[SESSION_COOKIE];
const csrfCookieValue = (request: FastifyRequest) => readCookies(request.headers.cookie)[CSRF_COOKIE];
const sessionCookie = (token: string, secure: boolean, maxAgeSeconds: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? '; Secure' : ''}`;
const csrfCookie = (token: string, secure: boolean, maxAgeSeconds: number) =>
  `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? '; Secure' : ''}`;

function readExpectedVersion(request: FastifyRequest) {
  const raw = request.headers['if-match'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = value?.match(/^(?:W\/)?"?(\d+)"?$/);
  return match ? Number(match[1]) : undefined;
}

function readOpaquePrecondition(request: FastifyRequest) {
  const raw = request.headers['if-match'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.replace(/^(?:W\/)?"|"$/g, '');
}

function sendStoreError(reply: FastifyReply, error: unknown) {
  if (error instanceof TopicStoreError) {
    const status = error.category === 'not_found' ? 404 : error.category === 'integrity_failed' ? 503 : 409;
    return reply.code(status).send({ error: error.message });
  }
  if (error instanceof z.ZodError) return reply.code(400).send({ error: '提交的数据无效。', issues: error.issues.map(issue => issue.message) });
  return reply.code(503).send({ error: '话题后台暂时不可用，请稍后重试。' });
}

export function registerTopicAdmin(app: FastifyInstance, options: TopicAdminGatewayOptions) {
  const log = options.operations ?? defaultOperationLogger;
  const clock = options.now ?? Date.now;
  const rateWindow = options.loginWindowMs ?? 15 * 60_000;
  const rateLimit = options.loginAttemptsPerWindow ?? 5;
  const buckets = new Map<string, RateBucket>();

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/admin/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  const finish = (request: FastifyRequest, startedAt: number, action: string, status: number, errorCategory?: string) =>
    log({ requestId: request.id, action, status, durationMs: operationDuration(startedAt), ...(errorCategory ? { errorCategory } : {}) });

  const originAllowed = (request: FastifyRequest, required: boolean) =>
    request.headers.origin === options.origin || (!required && !request.headers.origin);

  const guard = (request: FastifyRequest, reply: FastifyReply, mutate: boolean): AuthenticatedTopicAdmin | undefined => {
    if (!options.store || !options.auth) { reply.code(503).send({ error: '话题后台尚未配置。' }); return undefined; }
    if (!originAllowed(request, mutate)) { reply.code(403).send({ error: '来源不允许。' }); return undefined; }
    if (mutate && !contentTypeIsJson(request)) { reply.code(415).send({ error: '后台写入只接受 JSON。' }); return undefined; }
    try {
      return options.auth.authenticate(cookieValue(request), mutate ? String(request.headers['x-csrf-token'] ?? '') : undefined);
    } catch (error) {
      const status = error instanceof TopicAdminAuthError && error.category === 'csrf_rejected' ? 403 : 401;
      reply.code(status).send({ error: status === 401 ? '后台会话无效或已过期。' : '页面校验已失效，请刷新后重试。' });
      return undefined;
    }
  };

  app.post('/api/admin/auth/login', { bodyLimit: 4096 }, async (request, reply) => {
    const startedAt = performance.now();
    if (!options.auth || !options.store) { finish(request, startedAt, 'topic.admin.login', 503, 'not_configured'); return reply.code(503).send({ error: '话题后台尚未配置。' }); }
    if (!originAllowed(request, true)) { finish(request, startedAt, 'topic.admin.login', 403, 'origin_rejected'); return reply.code(403).send({ error: '来源不允许。' }); }
    if (!contentTypeIsJson(request)) { finish(request, startedAt, 'topic.admin.login', 415, 'content_type'); return reply.code(415).send({ error: '后台登录只接受 JSON。' }); }
    const current = clock();
    const existing = buckets.get(request.ip);
    const bucket = !existing || current - existing.startedAt >= rateWindow ? { startedAt: current, count: 0 } : existing;
    bucket.count += 1;
    buckets.set(request.ip, bucket);
    if (buckets.size > 1024) for (const [key, value] of buckets) if (current - value.startedAt >= rateWindow) buckets.delete(key);
    if (bucket.count > rateLimit) { finish(request, startedAt, 'topic.admin.login', 429, 'rate_limited'); return reply.code(429).send({ error: '登录尝试过多，请稍后再试。' }); }
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) { finish(request, startedAt, 'topic.admin.login', 401, 'invalid_credentials'); return reply.code(401).send({ error: '用户名或密码不正确。' }); }
    try {
      const session = options.auth.login(parsed.data.username, parsed.data.password);
      const maxAge = (new Date(session.expiresAt).getTime() - clock()) / 1000;
      finish(request, startedAt, 'topic.admin.login', 200);
      return reply.header('Set-Cookie', [sessionCookie(session.token, options.auth.configuration.secureCookie, maxAge),
        csrfCookie(session.csrfToken, options.auth.configuration.secureCookie, maxAge)])
        .send({ authenticated: true, username: session.username, csrfToken: session.csrfToken, expiresAt: session.expiresAt });
    } catch {
      finish(request, startedAt, 'topic.admin.login', 401, 'invalid_credentials');
      return reply.code(401).send({ error: '用户名或密码不正确。' });
    }
  });

  app.get('/api/admin/auth/session', async (request, reply) => {
    const startedAt = performance.now();
    const admin = guard(request, reply, false);
    if (!admin) { finish(request, startedAt, 'topic.admin.session', reply.statusCode, reply.statusCode === 503 ? 'not_configured' : 'unauthorized'); return; }
    const csrfToken = csrfCookieValue(request);
    try { options.auth!.authenticate(cookieValue(request), csrfToken); }
    catch { finish(request, startedAt, 'topic.admin.session', 401, 'csrf_rejected'); return reply.code(401).send({ error: '后台会话无效或已过期。' }); }
    finish(request, startedAt, 'topic.admin.session', 200);
    return reply.send({ authenticated: true, username: admin.username, csrfToken, expiresAt: admin.expiresAt });
  });

  app.delete('/api/admin/auth/session', async (request, reply) => {
    const startedAt = performance.now();
    const admin = guard(request, reply, true);
    if (!admin) { finish(request, startedAt, 'topic.admin.logout', reply.statusCode, 'rejected'); return; }
    if (!emptySchema.safeParse(request.body ?? {}).success) { finish(request, startedAt, 'topic.admin.logout', 400, 'invalid_request'); return reply.code(400).send({ error: '退出请求无效。' }); }
    options.auth!.logout(cookieValue(request), admin.username);
    finish(request, startedAt, 'topic.admin.logout', 204);
    return reply.header('Set-Cookie', [sessionCookie('', options.auth!.configuration.secureCookie, 0),
      csrfCookie('', options.auth!.configuration.secureCookie, 0)]).code(204).send();
  });

  app.get('/api/admin/topics', async (request, reply) => {
    const admin = guard(request, reply, false);
    if (!admin) return;
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: '筛选条件无效。' });
    try { return reply.send({ topics: options.store!.listAdmin(parsed.data), placements: options.store!.listPlacements() }); }
    catch (error) { return sendStoreError(reply, error); }
  });

  app.post('/api/admin/topics', async (request, reply) => {
    const admin = guard(request, reply, true);
    if (!admin) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return sendStoreError(reply, parsed.error);
    const now = new Date().toISOString();
    const id = parsed.data.id ?? `topic-${now.slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`;
    try {
      const topic = writingTopicSchema.parse({ id, revision: 1, status: parsed.data.status, ...parsed.data.content,
        updatedAt: now, publishedAt: null, reviewedBy: null, reviewedAt: null });
      return reply.code(201).send(options.store!.createEditable(topic, admin.username, parsed.data.editorBrief));
    } catch (error) { return sendStoreError(reply, error); }
  });

  app.get<{ Params: { id: string; revision: string } }>('/api/admin/topics/:id/revisions/:revision', async (request, reply) => {
    const admin = guard(request, reply, false);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.id);
    const revision = revisionSchema.safeParse(request.params.revision);
    if (!id.success || !revision.success) return reply.code(400).send({ error: '话题修订地址无效。' });
    const value = options.store!.getRevision(id.data, revision.data);
    return value ? reply.send(value) : reply.code(404).send({ error: '话题修订不存在。' });
  });

  app.get<{ Params: { id: string } }>('/api/admin/topics/:id/revisions', async (request, reply) => {
    const admin = guard(request, reply, false);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(400).send({ error: '话题地址无效。' });
    const revisions = options.store!.listRevisions(id.data);
    return revisions.length ? reply.send({ revisions }) : reply.code(404).send({ error: '话题不存在。' });
  });

  app.patch<{ Params: { id: string; revision: string } }>('/api/admin/topics/:id/revisions/:revision', async (request, reply) => {
    const admin = guard(request, reply, true);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.id);
    const revision = revisionSchema.safeParse(request.params.revision);
    const version = readExpectedVersion(request);
    const body = updateSchema.safeParse(request.body);
    if (!id.success || !revision.success || version === undefined || !body.success) return reply.code(400).send({ error: '话题修改请求无效或缺少 If-Match。' });
    try {
      const current = options.store!.getRevision(id.data, revision.data);
      if (!current) throw new TopicStoreError('not_found', '话题修订不存在');
      const topic = writingTopicSchema.parse({ ...current.topic, ...body.data.content, updatedAt: new Date().toISOString() });
      return reply.send(options.store!.updateEditable(topic, version, admin.username));
    } catch (error) { return sendStoreError(reply, error); }
  });

  const command = (name: 'reject' | 'publish' | 'correct' | 'archive') => {
    app.post<{ Params: { id: string; revision: string } }>(`/api/admin/topics/:id/revisions/:revision/${name}`, async (request, reply) => {
      const admin = guard(request, reply, true);
      if (!admin) return;
      const id = idSchema.safeParse(request.params.id);
      const revision = revisionSchema.safeParse(request.params.revision);
      const version = readExpectedVersion(request);
      if (!id.success || !revision.success || version === undefined) return reply.code(400).send({ error: '命令地址无效或缺少 If-Match。' });
      try {
        if (name === 'publish') {
          const body = publishSchema.parse(request.body);
          return reply.send(options.store!.publishAndSchedule(id.data, revision.data, version, admin.username,
            topicPlacementSchema.parse({ ...body, topicId: id.data, revision: revision.data })));
        }
        emptySchema.parse(request.body ?? {});
        if (name === 'reject') return reply.send(options.store!.reject(id.data, revision.data, version, admin.username));
        const current = options.store!.getRevision(id.data, revision.data);
        if (!current) throw new TopicStoreError('not_found', '话题修订不存在');
        if (current.editVersion !== version) throw new TopicStoreError('conflict', '话题已在其他页面更新');
        if (name === 'correct') return reply.code(201).send(options.store!.createCorrection(id.data, admin.username));
        return reply.send(options.store!.archive(id.data, revision.data, admin.username));
      } catch (error) { return sendStoreError(reply, error); }
    });
  };
  command('reject');
  command('publish');
  command('correct');
  command('archive');

  app.get<{ Params: { slot: string } }>('/api/admin/home-slots/:slot', async (request, reply) => {
    const admin = guard(request, reply, false);
    if (!admin) return;
    const slot = z.coerce.number().int().min(1).max(5).safeParse(request.params.slot);
    return slot.success ? reply.send({ slot: slot.data, placements: options.store!.listPlacements(slot.data) }) : reply.code(400).send({ error: '席位编号无效。' });
  });

  app.put<{ Params: { slot: string } }>('/api/admin/home-slots/:slot', async (request, reply) => {
    const admin = guard(request, reply, true);
    if (!admin) return;
    const slot = z.coerce.number().int().min(1).max(5).safeParse(request.params.slot);
    const body = placementWriteSchema.safeParse(request.body);
    const version = readExpectedVersion(request);
    if (!slot.success || !body.success || version === undefined) return reply.code(400).send({ error: '席位请求无效或缺少 If-Match。' });
    try {
      const target = options.store!.getRevision(body.data.topicId, body.data.revision);
      if (!target) throw new TopicStoreError('not_found', '话题修订不存在');
      if (target.editVersion !== version) throw new TopicStoreError('conflict', '话题已在其他页面更新');
      const placement = topicPlacementSchema.parse({ slot: slot.data, topicId: body.data.topicId, revision: body.data.revision,
        startsAt: body.data.startsAt, endsAt: body.data.endsAt });
      return reply.send(body.data.placementId
        ? options.store!.replacePlacement(body.data.placementId, placement, admin.username)
        : options.store!.addPlacement(placement, admin.username));
    } catch (error) { return sendStoreError(reply, error); }
  });

  app.delete<{ Params: { slot: string } }>('/api/admin/home-slots/:slot', async (request, reply) => {
    const admin = guard(request, reply, true);
    if (!admin) return;
    const slot = z.coerce.number().int().min(1).max(5).safeParse(request.params.slot);
    const body = placementDeleteSchema.safeParse(request.body);
    if (!slot.success || !body.success || readOpaquePrecondition(request) !== body.data.placementId) {
      return reply.code(400).send({ error: '删除席位请求无效或缺少正确的 If-Match。' });
    }
    const placement = options.store!.listPlacements(slot.data).find(item => item.id === body.data.placementId);
    if (!placement) return reply.code(404).send({ error: '排期不存在。' });
    try { options.store!.deletePlacement(body.data.placementId, admin.username); return reply.code(204).send(); }
    catch (error) { return sendStoreError(reply, error); }
  });

  app.get('/api/admin/topic-generations', async (request, reply) => {
    const admin = guard(request, reply, false);
    if (!admin) return;
    return reply.send({ generations: options.store!.listGenerations() });
  });

  app.get('/api/admin/audit', async (request, reply) => {
    const admin = guard(request, reply, false);
    if (!admin) return;
    return reply.send({ entries: options.store!.listAudit() });
  });
}
