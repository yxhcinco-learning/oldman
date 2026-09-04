import { loadAiConfiguration } from '../server/article-ai.ts';
import { callDeepSeekTopicCandidate, TopicAiError } from '../server/topic-ai.ts';

if (process.env.ALLOW_PAID_TOPIC_AI_TEST !== '1') {
  console.error('未执行真实话题 AI 请求：请显式设置 ALLOW_PAID_TOPIC_AI_TEST=1。');
  process.exitCode = 2;
} else {
  const configuration = loadAiConfiguration();
  if (!configuration) {
    console.error('未执行真实话题 AI 请求：DeepSeek 服务端配置不可用。');
    process.exitCode = 2;
  } else {
    const startedAt = Date.now();
    try {
      const result = await callDeepSeekTopicCandidate({
        brief: '面向中老年写作者，从亲身使用出发谈谈 AI 联网查资料带来的便利、判断过程和仍需人工核对的地方。',
        urls: ['https://api-docs.deepseek.com/zh-cn/guides/responses_api/'],
        webSearchEnabled: true,
      }, configuration, { timeoutMs: 90_000 });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        model: configuration.model,
        topLevelRequests: 1,
        searchCalls: result.searchCalls,
        inputTokens: result.usage?.input ?? null,
        outputTokens: result.usage?.output ?? null,
        sourceCount: result.content.sources.length,
        elapsedMs: Date.now() - startedAt,
      })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        ok: false,
        model: configuration.model,
        topLevelRequests: 1,
        category: error instanceof TopicAiError ? error.category : 'unexpected',
        elapsedMs: Date.now() - startedAt,
      })}\n`);
      process.exitCode = 1;
    }
  }
}
