import { createGateway } from './gateway';

const appId = process.env.TENCENT_ASR_APP_ID?.trim();
const secretId = process.env.TENCENT_ASR_SECRET_ID?.trim();
const secretKey = process.env.TENCENT_ASR_SECRET_KEY?.trim();
const credentials = appId && /^\d+$/.test(appId) && secretId && secretKey ? { appId, secretId, secretKey, token: process.env.TENCENT_ASR_TOKEN?.trim() || undefined } : undefined;
const gateway = await createGateway({ credentials, origin: process.env.ASR_ALLOWED_ORIGIN ?? 'http://localhost:3001',
  maxConnections: Math.max(1, Math.min(5, Number(process.env.ASR_MAX_CONNECTIONS) || 2)) });
try {
  await gateway.listen({ host: '127.0.0.1', port: 3002 });
  console.info(`本地语音网关 127.0.0.1:3002 · ${credentials ? '已配置（尚需真实联调）' : '未配置腾讯云凭据'}`);
} catch { console.error('语音网关启动失败，请检查 3002 端口是否占用'); process.exitCode = 1; }
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void gateway.close().then(() => process.exit(0)); });
