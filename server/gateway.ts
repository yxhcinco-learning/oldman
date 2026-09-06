import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { signedAsrUrl, parseTencentResult, type AsrEngineModel, type Credentials } from './tencent';
import { TranscriptAccumulator, type SpeechEvent } from '../packages/core/src/speech-protocol';
import { registerArticleAi, type AiGatewayOptions } from './article-ai';
import { defaultOperationLogger, OperationMonitor, operationDuration, type OperationLogger } from './operations';
import { registerTopics } from './topics';
import type { TopicStore } from './topic-store';
import { registerMiniAuth, type MiniAuthGatewayOptions } from './mini-auth';
import { SpeechTicketError, SpeechTicketStore } from './speech-ticket-store';
import { MiniIdentityError } from './mini-identity-store';
import { registerTopicAdmin, type TopicAdminGatewayOptions } from './topic-admin-api';
import { registerOperationalEvents } from './operational-events';
import { CostGovernanceError, type CostGovernanceStore, type CostReservation } from './cost-governance';

export interface GatewayOptions {
  credentials?: Credentials; origin: string; maxConnections?: number; maxDurationMs?: number; maxBytes?: number;
  engineModel?: AsrEngineModel;
  connect?: (url: string) => WebSocket;
  ai?: Omit<AiGatewayOptions, 'origin'>;
  topics?: TopicStore;
  topicAdmin?: Omit<TopicAdminGatewayOptions, 'origin' | 'store' | 'operations'>;
  topicAi?: NonNullable<TopicAdminGatewayOptions['ai']>;
  operations?: OperationLogger;
  operationMonitor?: OperationMonitor;
  eventRequestsPerMinute?: number;
  miniAuth?: Omit<MiniAuthGatewayOptions, 'operations'>;
  speechTickets?: SpeechTicketStore;
  costGovernance?: CostGovernanceStore;
}
export async function createGateway(options: GatewayOptions) {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  const monitor = options.operationMonitor ?? new OperationMonitor();
  const sink = options.operations ?? defaultOperationLogger;
  const operations: OperationLogger = entry => { monitor.record(entry); sink(entry); };
  const capabilities = () => ({
    aiConfigured: Boolean(options.ai?.configuration),
    speechConfigured: Boolean(options.credentials),
    topicsConfigured: Boolean(options.topics),
    topicAiConfigured: Boolean(options.topicAi?.configuration),
    topicAdminConfigured: Boolean(options.topicAdmin?.auth),
    miniIdentityConfigured: Boolean(options.miniAuth?.service),
    costGovernanceConfigured: Boolean(options.costGovernance),
  });
  registerArticleAi(app, { ...options.ai, origin: options.origin, operations, miniAuthService: options.miniAuth?.service, costGovernance: options.costGovernance });
  registerTopics(app, { origin: options.origin, store: options.topics, operations });
  registerTopicAdmin(app, { ...options.topicAdmin, origin: options.origin, store: options.topics, operations, ai: options.topicAi,
    costGovernance: options.costGovernance, monitor, capabilities });
  registerMiniAuth(app, { ...options.miniAuth, operations });
  registerOperationalEvents(app, { origin: options.origin, operations, requestsPerMinute: options.eventRequestsPerMinute });
  const active = new Set<WebSocket>();
  const speechTickets = options.speechTickets ?? new SpeechTicketStore();
  const speechReservations = new Map<string, CostReservation>();
  const configuredSpeechSeconds = Math.max(1, Math.ceil((options.maxDurationMs ?? 300_000) / 1_000));
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  app.get('/api/health', async (request, reply) => {
    const startedAt = performance.now();
    const result = { status: 'ok', ...capabilities() };
    operations({ requestId: request.id, action: 'health', status: 200, durationMs: operationDuration(startedAt) });
    return reply.header('Cache-Control', 'no-store').send(result);
  });
  app.get('/api/speech/status', async (request, reply) => {
    const startedAt = performance.now();
    if (request.headers.origin && request.headers.origin !== options.origin) {
      operations({ requestId: request.id, action: 'speech.status', status: 403, durationMs: operationDuration(startedAt), errorCategory: 'origin_rejected' });
      return reply.code(403).send({ configured: false });
    }
    let budgetSeconds = configuredSpeechSeconds;
    if (options.costGovernance) {
      try { budgetSeconds = Math.min(configuredSpeechSeconds, options.costGovernance.snapshot().speech.remainingSeconds); }
      catch { budgetSeconds = 0; }
    }
    operations({ requestId: request.id, action: 'speech.status', status: 200, durationMs: operationDuration(startedAt) });
    return { configured: Boolean(options.credentials) && budgetSeconds > 0, provider: '腾讯云', maxSeconds: Math.max(0, budgetSeconds) };
  });
  app.post('/api/mini/speech-ticket', async (request, reply) => {
    const startedAt = performance.now();
    const finish = (status: number, errorCategory?: string) => operations({ requestId: request.id, action: 'mini.speech.ticket', status,
      durationMs: operationDuration(startedAt), ...(errorCategory ? { errorCategory } : {}) });
    reply.header('Cache-Control', 'no-store');
    if (!options.miniAuth?.service) {
      finish(503, 'auth_not_configured');
      return reply.code(503).send({ error: '在线身份服务尚未配置，本地写作仍可使用。' });
    }
    let userId: string;
    try { userId = options.miniAuth.service.authenticateBearer(request.headers.authorization).userId; }
    catch (error) {
      if (error instanceof MiniIdentityError) {
        finish(401, 'unauthorized');
        return reply.code(401).send({ error: '在线身份已失效，请重试。' });
      }
      finish(503, 'identity_unavailable');
      return reply.code(503).send({ error: '在线身份服务暂不可用，本地写作仍可使用。' });
    }
    if (!options.credentials) {
      finish(503, 'not_configured');
      return reply.code(503).send({ error: '语音服务尚未配置，请继续使用文字输入。' });
    }
    try {
      const issued = speechTickets.issue(userId);
      finish(200);
      return reply.send({ ticket: issued.ticket, expiresAt: new Date(issued.expiresAt).toISOString() });
    } catch (error) {
      if (error instanceof SpeechTicketError && error.category === 'ticket_limited') {
        finish(429, 'ticket_limited');
        return reply.code(429).send({ error: '语音准备较频繁，请稍后再试。' });
      }
      finish(503, 'ticket_unavailable');
      return reply.code(503).send({ error: '语音准备暂不可用，请继续使用文字输入。' });
    }
  });

  const reserveSpeechBudget = (request: FastifyRequest, reply: FastifyReply, action: 'speech.session' | 'mini.speech.session', startedAt: number) => {
    if (!options.costGovernance) return undefined;
    try {
      const reservation = options.costGovernance.reserveSpeech(configuredSpeechSeconds);
      speechReservations.set(request.id, reservation);
      return undefined;
    } catch (error) {
      const failure = error instanceof CostGovernanceError
        ? error
        : new CostGovernanceError(503, 'cost_governance_unavailable', '用量保护暂不可用，请继续使用文字输入。');
      operations({ requestId: request.id, action, status: failure.status, durationMs: operationDuration(startedAt), errorCategory: failure.category });
      const message = failure.category === 'daily_budget_exhausted'
        ? '今日语音额度已用完，请明天再试；您可以继续使用文字输入。'
        : '用量保护暂不可用，请继续使用文字输入。';
      return reply.code(failure.status).send({ error: message });
    }
  };

  const speechSession = (socket: WebSocket, request: FastifyRequest, action: 'speech.session' | 'mini.speech.session') => {
    const startedAt = performance.now();
    const reservation = speechReservations.get(request.id);
    speechReservations.delete(request.id);
    let finalStatus = 499;
    let finalCategory: string | undefined = 'client_closed';
    let logged = false;
    const finishLog = () => {
      if (logged) return;
      logged = true;
      operations({ requestId: request.id, action, status: finalStatus, durationMs: operationDuration(startedAt), ...(finalCategory ? { errorCategory: finalCategory } : {}) });
    };
    active.add(socket);
    let upstream: WebSocket;
    try { upstream = (options.connect ?? (url => new WebSocket(url, { handshakeTimeout: 8000, maxPayload: 1024 * 1024 })))(signedAsrUrl(options.credentials!, { engineModel: options.engineModel })); }
    catch {
      if (reservation) { try { options.costGovernance!.release(reservation); } catch { /* No upstream connection was created. */ } }
      finalStatus = 502; finalCategory = 'upstream_create'; active.delete(socket); socket.send(JSON.stringify({ type: 'error', message: '无法创建语音连接，请检查本地配置' })); socket.close(1011); finishLog(); return;
    }
    const accumulator = new TranscriptAccumulator();
    let ready = false, ended = false, completed = false, released = false, bytes = 0;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const send = (event: SpeechEvent) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event)); };
    const release = () => {
      if (released) return;
      released = true; active.delete(socket); clearTimeout(maxTimer); clearTimeout(readyTimer); clearTimeout(finishTimer);
      if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
      else if (upstream.readyState === WebSocket.OPEN) upstream.close();
      if (reservation) {
        try { options.costGovernance!.settleSpeech(reservation, Math.ceil(operationDuration(startedAt) / 1_000)); }
        catch { finalStatus = 503; finalCategory = 'cost_governance_unavailable'; }
      }
      finishLog();
    };
    const fail = (message: string, category = 'upstream_unavailable') => { if (completed || released) return; finalStatus = 502; finalCategory = category; send({ type: 'error', message }); socket.close(1011, 'Recognition unavailable'); release(); };
    const end = () => {
      if (ended || released) return;
      ended = true;
      if (!ready || upstream.readyState !== WebSocket.OPEN) { fail('语音连接尚未准备好，请重试', 'upstream_not_ready'); return; }
      upstream.send(JSON.stringify({ type: 'end' }));
      finishTimer = setTimeout(() => fail('识别收尾超时，已收到的文字已保留', 'upstream_finish_timeout'), 10000);
    };
    const readyTimer = setTimeout(() => fail('语音连接超时，请稍后重试', 'upstream_ready_timeout'), 10000);
    const maxTimer = setTimeout(() => { send({ type: 'limit' }); end(); }, reservation ? reservation.speechSeconds * 1_000 : options.maxDurationMs ?? 300_000);
    upstream.on('message', data => {
      if (released) return;
      try {
        const result = parseTencentResult(JSON.parse(data.toString()), accumulator);
        if (!ready) { ready = true; clearTimeout(readyTimer); send({ type: 'ready' }); }
        if (result.changed) send({ type: 'transcript', text: result.text, final: result.final });
        if (result.done) { completed = true; finalStatus = 200; finalCategory = undefined; send({ type: 'done' }); socket.close(1000); release(); }
      } catch { fail('腾讯云识别未成功，请检查服务额度、密钥权限与网络', 'upstream_response'); }
    });
    upstream.on('error', () => fail('无法连接语音识别服务，请检查网络和配置', 'upstream_network'));
    upstream.on('close', () => { if (!completed && !released) fail('语音连接中断，已收到的文字已保留', 'upstream_closed'); });
    socket.on('message', (data, binary) => {
      if (released) return;
      if (!binary) {
        try {
          const event = JSON.parse(data.toString());
          if (event.type === 'cancel') { socket.close(1000); release(); }
          else if (event.type === 'end') end();
          else fail('不支持的语音操作', 'invalid_operation');
        } catch { fail('语音数据格式错误', 'invalid_message'); }
        return;
      }
      if (ended) return;
      if (!ready) { fail('请等待语音连接准备好', 'audio_before_ready'); return; }
      const length = Buffer.isBuffer(data) ? data.length : data instanceof ArrayBuffer ? data.byteLength : data.reduce((n, b) => n + b.length, 0);
      bytes += length;
      if (length % 2 || bytes > (options.maxBytes ?? 10 * 1024 * 1024) || upstream.bufferedAmount > 256 * 1024) { fail('音频过长或网络过慢，请分段再说', 'audio_limit'); return; }
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: true });
    });
    socket.on('close', release);
    socket.on('error', release);
  };
  app.get('/api/speech', {
    websocket: true,
    preValidation: async (request, reply) => {
      const startedAt = performance.now();
      if (request.headers.origin !== options.origin) {
        operations({ requestId: request.id, action: 'speech.session', status: 403, durationMs: operationDuration(startedAt), errorCategory: 'origin_rejected' });
        return reply.code(403).send({ error: '来源不允许' });
      }
      if (!options.credentials) {
        operations({ requestId: request.id, action: 'speech.session', status: 503, durationMs: operationDuration(startedAt), errorCategory: 'not_configured' });
        return reply.code(503).send({ error: '请先配置本地语音服务' });
      }
      if (active.size >= (options.maxConnections ?? 2)) {
        operations({ requestId: request.id, action: 'speech.session', status: 429, durationMs: operationDuration(startedAt), errorCategory: 'connection_limited' });
        return reply.code(429).send({ error: '录音连接已满' });
      }
      return reserveSpeechBudget(request, reply, 'speech.session', startedAt);
    },
  }, (socket, request) => speechSession(socket, request, 'speech.session'));
  app.get('/api/mini/speech', {
    websocket: true,
    preValidation: async (request, reply) => {
      const startedAt = performance.now();
      const fail = (status: number, errorCategory: string, error: string) => {
        operations({ requestId: request.id, action: 'mini.speech.session', status, durationMs: operationDuration(startedAt), errorCategory });
        return reply.code(status).send({ error });
      };
      if (!options.credentials) return fail(503, 'not_configured', '语音服务尚未配置，请继续使用文字输入。');
      if (active.size >= (options.maxConnections ?? 2)) return fail(429, 'connection_limited', '录音连接已满');
      const query = request.query;
      if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length !== 1 || typeof (query as { ticket?: unknown }).ticket !== 'string') {
        return fail(401, 'ticket_rejected', '语音连接已失效，请重试。');
      }
      try { speechTickets.consume((query as { ticket: string }).ticket); }
      catch { return fail(401, 'ticket_rejected', '语音连接已失效，请重试。'); }
      return reserveSpeechBudget(request, reply, 'mini.speech.session', startedAt);
    },
  }, (socket, request) => speechSession(socket, request, 'mini.speech.session'));
  app.addHook('preClose', async () => {
    for (const socket of active) socket.close(1001);
    for (const reservation of speechReservations.values()) {
      try { options.costGovernance?.release(reservation); } catch { /* No upstream session was created. */ }
    }
    speechReservations.clear();
  });
  return app;
}
