import { loadAiConfiguration, prepareArticleAiRequest, callDeepSeek } from '../server/article-ai';
import { createCostRuntime, loadCostRuntime } from '../server/cost-runtime';
import { emptyDraft, newSession, startInterview, prepareDialogue, buildAiRequest, settleDialogue } from '../packages/core/src/index';

// Explicit, bounded, non-sensitive live entry. Never invoked by check or CI.
const configuration = loadAiConfiguration();
const costConfiguration = loadCostRuntime().configuration;
if (!configuration || !costConfiguration) throw new Error('缺少 AI 或用量保护配置；没有发送。');
const cost = createCostRuntime(costConfiguration);
const draft = emptyDraft();
let session = startInterview(newSession(draft), draft, 'live-start');
try {
  for (const [index, prompt] of ['你好', '我想聊学骑自行车。十岁时父亲扶着车后座陪我练习，我摔了一次，后来终于能自己骑了。', '把刚才聊的整理出来，结束访谈吧'].entries()) {
    const id = `live-${index}`;
    session = prepareDialogue(session, draft, id, prompt, 'send');
    const request = buildAiRequest(session, 'dialogue', prompt, id);
    const prepared = prepareArticleAiRequest(request);
    if (prepared.maxInputTokens > 30000) throw new Error('超过本次联调输入上限，停止。');
    prepared.maxOutputTokens = 2048;
    prepared.body = JSON.stringify({ ...JSON.parse(prepared.body), max_tokens: 2048 });
    session.turns.push({ id, action: 'dialogue', command: 'send', prompt, createdAt: new Date().toISOString(), inputVersionId: request.current.id, status: 'running' });
    const reservation = cost.store.reserveAi('article_ai', prepared.maxInputTokens, 2048);
    let response;
    try { response = await callDeepSeek(request, configuration, AbortSignal.timeout(55000), fetch, prepared); }
    catch (error) { cost.store.settleAi(reservation); throw new Error(`第 ${index + 1} 次真实调用失败，已停止，未重试。${error instanceof Error && error.name !== 'ZodError' ? error.message : '结构化格式无效'}`); }
    cost.store.settleAi(reservation, response.usage);
    session = settleDialogue(session, id, response.result);
    console.info(JSON.stringify({ step: index + 1, mode: session.conversation!.mode, intent: response.result.dialogue!.intent,
      answer: response.result.answer, materialCount: session.conversation!.materials.length, candidate: response.result.body ?? null, usage: response.usage }));
  }
} finally { cost.close(); }
