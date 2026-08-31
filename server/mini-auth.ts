import type { FastifyInstance } from 'fastify';
import { MiniIdentityError } from './mini-identity-store';
import { defaultOperationLogger, operationDuration, type OperationLogger } from './operations';
import { WechatAuthService, WechatExchangeError } from './wechat-auth';

interface RateBucket { startedAt: number; count: number }

export interface MiniAuthGatewayOptions {
  service?: WechatAuthService;
  operations?: OperationLogger;
  now?: () => number;
  requestsPerMinute?: number;
}

const loginError = { error: '无法建立在线会话，请重试' };
const unavailableError = { error: '微信登录暂不可用，本地写作仍可使用' };

export function registerMiniAuth(app: FastifyInstance, options: MiniAuthGatewayOptions = {}) {
  const log = options.operations ?? defaultOperationLogger;
  const now = options.now ?? Date.now;
  const limit = options.requestsPerMinute ?? 10;
  const buckets = new Map<string, RateBucket>();

  app.post('/api/mini/auth/wechat', { bodyLimit: 2048 }, async (request, reply) => {
    const startedAt = performance.now();
    const finish = (status: number, errorCategory?: string) => {
      log({ requestId: request.id, action: 'mini.auth.wechat', status, durationMs: operationDuration(startedAt), ...(errorCategory ? { errorCategory } : {}) });
    };
    const current = now();
    if (buckets.size >= 1024) {
      for (const [key, value] of buckets) if (current - value.startedAt >= 60_000) buckets.delete(key);
      if (buckets.size >= 1024 && !buckets.has(request.ip)) {
        finish(429, 'rate_limited');
        return reply.code(429).header('Cache-Control', 'no-store').send({ error: '请求较频繁，请稍后重试' });
      }
    }
    const existing = buckets.get(request.ip);
    const bucket = !existing || current - existing.startedAt >= 60_000 ? { startedAt: current, count: 0 } : existing;
    bucket.count += 1;
    buckets.set(request.ip, bucket);
    if (bucket.count > limit) {
      finish(429, 'rate_limited');
      return reply.code(429).header('Cache-Control', 'no-store').send({ error: '请求较频繁，请稍后重试' });
    }
    if (!options.service) {
      finish(503, 'not_configured');
      return reply.code(503).header('Cache-Control', 'no-store').send(unavailableError);
    }
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'code') ||
        typeof (body as { code?: unknown }).code !== 'string') {
      finish(400, 'invalid_request');
      return reply.code(400).header('Cache-Control', 'no-store').send(loginError);
    }
    try {
      const session = await options.service.login((body as { code: string }).code);
      finish(200);
      return reply.header('Cache-Control', 'no-store').send({ token: session.token, expiresAt: new Date(session.expiresAt).toISOString() });
    } catch (error) {
      if (error instanceof MiniIdentityError && error.category === 'replayed_code') {
        finish(401, 'code_rejected');
        return reply.code(401).header('Cache-Control', 'no-store').send(loginError);
      }
      if (error instanceof WechatExchangeError && ['invalid_code', 'app_mismatch'].includes(error.category)) {
        finish(401, 'code_rejected');
        return reply.code(401).header('Cache-Control', 'no-store').send(loginError);
      }
      finish(503, error instanceof WechatExchangeError ? error.category : 'identity_unavailable');
      return reply.code(503).header('Cache-Control', 'no-store').send(unavailableError);
    }
  });
}
