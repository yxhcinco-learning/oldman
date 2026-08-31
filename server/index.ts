import { createGateway } from './gateway';
import { loadSpeechCredentials } from './credentials';
import { loadAiConfiguration } from './article-ai';
import { loadGatewayRuntime } from './runtime';
import { loadAsrEngineModel } from './tencent';

const runtime = loadGatewayRuntime();
const engineModel = loadAsrEngineModel();
const { credentials, source, problem } = await loadSpeechCredentials();
const aiConfiguration = loadAiConfiguration();
const gateway = await createGateway({ credentials, origin: runtime.origin,
  engineModel, maxConnections: Math.max(1, Math.min(5, Number(process.env.ASR_MAX_CONNECTIONS) || 2)), ai: { configuration: aiConfiguration } });
try {
  await gateway.listen({ host: runtime.host, port: runtime.port });
  console.info(`本地语音网关 ${runtime.host}:${runtime.port} · ${credentials ? `已配置（${source}，${engineModel}，配置状态不代表识别成功）` : '未配置腾讯云凭据'}`);
  if (problem) console.warn(problem);
  console.info(`文章 AI · DeepSeek V4 Flash · ${aiConfiguration ? '已配置（配置状态不代表生成成功）' : '未配置或配置无效'}`);
} catch { console.error(`语音网关启动失败，请检查 ${runtime.port} 端口是否占用`); process.exitCode = 1; }
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void gateway.close().then(() => process.exit(0)); });
