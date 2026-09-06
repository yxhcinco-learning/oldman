import { loadAiConfiguration, prepareArticleAiRequest, callDeepSeek } from '../server/article-ai';
import { createCostRuntime, loadCostRuntime } from '../server/cost-runtime';
import { emptyDraft, newSession, startInterview, prepareDialogue, buildAiRequest, settleDialogue } from '../packages/core/src/index';
import assert from 'node:assert/strict';

// Explicit, bounded, non-sensitive live entry. Never invoked by check or CI.
const configuration = loadAiConfiguration();
const costConfiguration = loadCostRuntime().configuration;
if (!configuration || !costConfiguration) throw new Error('缺少 AI 或用量保护配置；没有发送。');
const cost = createCostRuntime(costConfiguration);
const pendingEditScenario = process.argv.includes('--pending-edit');
const cancelOnly = process.argv.includes('--cancel-edit');
const draft = pendingEditScenario || cancelOnly ? { ...emptyDraft(), inputMode: 'text' as const, textDraft: '十岁时，我跟父亲学骑自行车。他扶着车后座陪我练习，我摔了一次，后来终于能自己骑了。' } : emptyDraft();
let session = startInterview(newSession(draft), draft, 'live-start');
if (cancelOnly) session.conversation = { ...session.conversation!, pendingEdit: '帮我把现有正文改得简短一点' };
const prompts = cancelOnly ? ['刚才的修改先取消，我们继续聊经历。'] : pendingEditScenario ? ['帮我把现有正文改得简短一点', '为什么要先结束访谈才能修改？', '刚才的修改先取消，我们继续聊经历。']
  : ['你好', '我想聊学骑自行车。十岁时父亲扶着车后座陪我练习，我摔了一次，后来终于能自己骑了。', '把刚才聊的整理出来，结束访谈吧'];
try {
  for (const [index, prompt] of prompts.entries()) {
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
    if (cancelOnly) {
      assert.equal(session.conversation!.mode, 'interview');
      assert.equal(session.conversation!.pendingEdit, undefined);
      assert.equal(response.result.dialogue!.intent, 'cancel-edit');
      assert.equal(response.result.body, undefined);
      continue;
    }
    if (pendingEditScenario) {
      assert.equal(session.conversation!.mode, 'interview');
      assert.equal(response.result.body, undefined);
      assert.equal(session.conversation!.pendingEdit, index === 2 ? undefined : prompts[0]);
      if (index === 2) assert.equal(response.result.dialogue!.intent, 'cancel-edit');
    } else {
      assert.equal(session.conversation!.mode, index === 2 ? 'conversation' : 'interview');
      if (index === 0) assert.equal(session.conversation!.materials.length, 0);
      if (index === 1) assert.ok(session.conversation!.materials.length > 0);
      if (index === 2) {
        const body = response.result.body;
        assert.ok(body && body.trim());
        // Only guards this synthetic fixture's observed failures; human source review remains required.
        assert.doesNotMatch(body, /膝盖|蹭破|擦破|打退堂鼓|没有催|鼓励|风.*耳|自由的感觉/, '短材料出现已观测的无来源细节；停止且不重试。');
        console.info(JSON.stringify({ semanticReviewRequired: true, reason: '非空正文与固定样例断言不能代替逐句来源核对' }));
      }
    }
  }
} finally { cost.close(); }
