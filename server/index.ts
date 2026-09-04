import { createGateway } from './gateway';
import { loadSpeechCredentials } from './credentials';
import { loadAiConfiguration } from './article-ai';
import { loadGatewayRuntime } from './runtime';
import { loadAsrEngineModel } from './tencent';
import { createMiniIdentityRuntime, loadMiniIdentityRuntime } from './mini-runtime';
import { createTopicRuntime, loadTopicRuntime } from './topic-runtime';
import { loadTopicAdminConfiguration, TopicAdminAuthService } from './topic-admin-auth';

const runtime = loadGatewayRuntime();
const engineModel = loadAsrEngineModel();
const { credentials, source, problem } = await loadSpeechCredentials();
const aiConfiguration = loadAiConfiguration();
const miniIdentityLoad = loadMiniIdentityRuntime();
const topicLoad = loadTopicRuntime();
const topicAdminLoad = loadTopicAdminConfiguration();
let miniIdentity: ReturnType<typeof createMiniIdentityRuntime> | undefined;
let topicRuntime: ReturnType<typeof createTopicRuntime> | undefined;
let miniIdentityProblem = miniIdentityLoad.problem;
let topicProblem = topicLoad.problem;
let topicAdmin: TopicAdminAuthService | undefined;
let topicAdminProblem = topicAdminLoad.problem;
if (miniIdentityLoad.configuration) {
  try { miniIdentity = createMiniIdentityRuntime(miniIdentityLoad.configuration); }
  catch { miniIdentityProblem = '微信小程序身份库不可用，在线身份已关闭。'; }
}
if (topicLoad.configuration) {
  try { topicRuntime = createTopicRuntime(topicLoad.configuration); }
  catch { topicProblem = '话题数据库不可用，热门与后台已关闭。'; }
}
if (topicRuntime && topicAdminLoad.configuration) {
  try { topicAdmin = new TopicAdminAuthService(topicRuntime.store, topicAdminLoad.configuration); }
  catch { topicAdminProblem = '话题管理员会话初始化失败，内部后台已关闭。'; }
}
const gateway = await createGateway({ credentials, origin: runtime.origin,
  engineModel, maxConnections: Math.max(1, Math.min(5, Number(process.env.ASR_MAX_CONNECTIONS) || 2)), ai: { configuration: aiConfiguration },
  ...(miniIdentity ? { miniAuth: { service: miniIdentity.service } } : {}), ...(topicRuntime ? { topics: topicRuntime.store } : {}),
  ...(topicAdmin ? { topicAdmin: { auth: topicAdmin } } : {}), ...(aiConfiguration ? { topicAi: { configuration: aiConfiguration } } : {}) });
gateway.addHook('onClose', async () => { miniIdentity?.close(); topicRuntime?.close(); });
try {
  await gateway.listen({ host: runtime.host, port: runtime.port });
  console.info(`本地语音网关 ${runtime.host}:${runtime.port} · ${credentials ? `已配置（${source}，${engineModel}，配置状态不代表识别成功）` : '未配置腾讯云凭据'}`);
  if (problem) console.warn(problem);
  console.info(`文章 AI · DeepSeek V4 Flash · ${aiConfiguration ? '已配置（配置状态不代表生成成功）' : '未配置或配置无效'}`);
  console.info(`微信小程序身份 · ${miniIdentity ? '已配置（配置状态不代表换码成功）' : '未配置或配置无效'}`);
  if (miniIdentityProblem) console.warn(miniIdentityProblem);
  console.info(`热门内容 · ${topicRuntime ? '已配置（SQLite）' : '未配置或配置无效'}`);
  if (topicProblem) console.warn(topicProblem);
  console.info(`话题后台 · ${topicAdmin ? '已配置' : '未配置或配置无效'}`);
  if (topicAdminProblem) console.warn(topicAdminProblem);
} catch { console.error(`语音网关启动失败，请检查 ${runtime.port} 端口是否占用`); await gateway.close(); process.exitCode = 1; }
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void gateway.close().then(() => process.exit(0)); });
