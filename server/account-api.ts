import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import sharp from 'sharp';
import { cloudIdSchema, cloudMutationSchema } from '../packages/core/src/cloud-protocol';
import { AccountStore } from './account-store';
import { CloudWorkError, CloudWorkStore, type CloudWorkLimits } from './cloud-work-store';
import { MiniIdentityError } from './mini-identity-store';
import { defaultOperationLogger, operationDuration, type OperationLogger } from './operations';
import { WechatExchangeError, type WechatAuthService } from './wechat-auth';

interface AccountApiOptions { service?: WechatAuthService; operations?: OperationLogger; limits?: Partial<CloudWorkLimits>; requestsPerMinute?: number }
const bearer = (request: FastifyRequest) => {
  const token = /^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(request.headers.authorization ?? '')?.[1];
  if (!token) throw new MiniIdentityError('invalid_session');
  return token;
};
const invalid = () => new CloudWorkError(400, 'invalid_request', '请求内容无效，请重试。');

export function registerAccountApi(app: FastifyInstance, options: AccountApiOptions) {
  const log = options.operations ?? defaultOperationLogger;
  const identity = options.service?.store;
  const accounts = identity ? new AccountStore(identity) : undefined;
  const works = identity ? new CloudWorkStore(identity, options.limits) : undefined;
  const buckets = new Map<string, { minute: number; count: number }>();
  const consume = (key: string, limit: number) => {
    const minute = Math.floor(Date.now() / 60_000);
    if (buckets.size >= 2048) {
      for (const [id, bucket] of buckets) if (bucket.minute !== minute) buckets.delete(id);
      if (buckets.size >= 2048 && !buckets.has(key)) throw new CloudWorkError(429, 'rate_limited', '请求较频繁，请稍后重试。');
    }
    const previous = buckets.get(key);
    const bucket = previous?.minute === minute ? previous : { minute, count: 0 };
    buckets.set(key, bucket);
    if (++bucket.count > limit) throw new CloudWorkError(429, 'rate_limited', '请求较频繁，请稍后重试。');
  };
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 2 * 1024 * 1024 }, (_request, body, done) => done(null, body));
  type Handler = (request: FastifyRequest, reply: FastifyReply, token: string) => unknown;
  const route = (method: HTTPMethods, url: string, action: string, handler: Handler, bodyLimit = 2048, authenticated = true) => {
    app.route({ method, url, bodyLimit, handler: async (request, reply) => {
      const startedAt = performance.now();
      reply.header('Cache-Control', 'no-store');
      try {
        if (!identity || !accounts || !works) throw new CloudWorkError(503, 'account_unavailable', '账号与云保存暂不可用，本机草稿仍可使用。');
        consume(`ip:${request.ip}`, authenticated ? 300 : 10);
        const token = authenticated ? bearer(request) : '';
        if (authenticated) consume(`account:${identity.authenticate(token, true).userId}`, options.requestsPerMinute ?? 120);
        const result = await handler(request, reply, token);
        log({ requestId: request.id, action, status: reply.statusCode, durationMs: operationDuration(startedAt) });
        return result;
      } catch (error) {
        let status = 503, code = 'account_unavailable', message = '账号与云保存暂不可用，请稍后重试。';
        if (error instanceof CloudWorkError) { status = error.status; code = error.code; message = error.message; }
        else if (error instanceof MiniIdentityError) {
          status = 401; code = error.category;
          message = code === 'session_replaced' ? '已在其他设备登录，请点击微信登录以在此设备继续。' : '登录已失效，请点击微信登录。';
        } else if (error instanceof WechatExchangeError) { status = 401; code = 'login_failed'; message = '微信登录未成功，请重试。'; }
        log({ requestId: request.id, action, status, durationMs: operationDuration(startedAt), errorCategory: code });
        return reply.code(status).send({ code, error: message });
      }
    } });
  };
  route('POST', '/api/mini/account/login', 'mini.account.login', async request => {
    const body = request.body as { code?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'code') || typeof body.code !== 'string') throw invalid();
    const session = await options.service!.login(body.code, 'account');
    return { token: session.token, account: accounts!.profile(session.token) };
  }, 2048, false);
  route('GET', '/api/mini/account/me', 'mini.account.me', (_request, _reply, token) => accounts!.profile(token));
  route('GET', '/api/mini/account/session', 'mini.account.session', (_request, _reply, token) => accounts!.profile(token));
  route('POST', '/api/mini/account/session/renew', 'mini.account.renew', (_request, _reply, token) => {
    identity!.renewAccount(token); return accounts!.profile(token);
  });
  route('DELETE', '/api/mini/account/session', 'mini.account.logout', (_request, reply, token) => { identity!.revoke(token); return reply.code(204).send(); });
  route('PATCH', '/api/mini/account/me', 'mini.account.profile', (request, _reply, token) => {
    const body = request.body as { nickname?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'nickname') || typeof body.nickname !== 'string') throw invalid();
    return accounts!.updateNickname(token, body.nickname);
  });
  route('GET', '/api/mini/account/avatar', 'mini.account.avatar.read', (_request, reply, token) => reply.type('image/jpeg').header('X-Content-Type-Options', 'nosniff').send(accounts!.avatar(token)));
  route('DELETE', '/api/mini/account/avatar', 'mini.account.avatar.delete', (_request, _reply, token) => accounts!.setAvatar(token, null));
  route('PUT', '/api/mini/account/avatar', 'mini.account.avatar.write', async (request, _reply, token) => {
    if (!Buffer.isBuffer(request.body) || !request.body.byteLength || request.body.byteLength > 2 * 1024 * 1024) throw invalid();
    let avatar: Buffer;
    try {
      const image = sharp(request.body, { limitInputPixels: 16_000_000, animated: false, failOn: 'warning' });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('unsupported');
      avatar = await image.rotate().resize(256, 256, { fit: 'cover' }).flatten({ background: '#fbf9f8' }).jpeg({ quality: 85 }).toBuffer();
    } catch { throw new CloudWorkError(400, 'invalid_avatar', '无法读取这张头像，请选择 JPG、PNG 或 WebP 图片。'); }
    // Decoding is asynchronous; setAvatar re-authenticates inside the committing transaction.
    return accounts!.setAvatar(token, avatar);
  }, 2 * 1024 * 1024);
  route('GET', '/api/mini/works', 'mini.works.list', (request, _reply, token) => {
    const query = request.query as { cursor?: unknown };
    if (Object.keys(query).some(key => key !== 'cursor') || query.cursor !== undefined && !/^\d{1,16}$/.test(String(query.cursor))) throw invalid();
    return works!.changes(token, Number(query.cursor ?? 0));
  });
  route('GET', '/api/mini/works/:id', 'mini.works.read', (request, _reply, token) => {
    const id = cloudIdSchema.safeParse((request.params as { id: string }).id);
    if (!id.success) throw invalid();
    return works!.get(token, id.data);
  });
  route('POST', '/api/mini/works/mutations', 'mini.works.mutate', (request, _reply, token) => {
    const parsed = cloudMutationSchema.safeParse(request.body, { jitless: true });
    if (!parsed.success) throw invalid();
    return works!.mutate(token, parsed.data);
  }, 9 * 1024 * 1024);
}
