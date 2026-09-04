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
    let providerMetadata = { providerStatus: null, searchCalls: null, inputTokens: null, outputTokens: null };
    const metadataOnlyFetch = async (url, init) => {
      const response = await fetch(url, init);
      try {
        const raw = await response.clone().json();
        providerMetadata = {
          providerStatus: typeof raw?.status === 'string' ? raw.status : null,
          searchCalls: Array.isArray(raw?.output) ? raw.output.filter(item => item?.type === 'web_search_call').length : null,
          inputTokens: Number.isSafeInteger(raw?.usage?.input_tokens) ? raw.usage.input_tokens : null,
          outputTokens: Number.isSafeInteger(raw?.usage?.output_tokens) ? raw.usage.output_tokens : null,
        };
      } catch {
        // A malformed response remains an adapter failure; never print its body.
      }
      return response;
    };
    try {
      const result = await callDeepSeekTopicCandidate({
        brief: '面向中老年写作者，从亲身使用出发谈谈 AI 联网查资料带来的便利、判断过程和仍需人工核对的地方。',
        urls: ['https://api-docs.deepseek.com/zh-cn/guides/responses_api/'],
        webSearchEnabled: true,
      }, configuration, { timeoutMs: 90_000, fetch: metadataOnlyFetch });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        model: configuration.model,
        topLevelRequests: 1,
        searchCalls: providerMetadata.searchCalls ?? result.searchCalls,
        inputTokens: providerMetadata.inputTokens ?? result.usage?.input ?? null,
        outputTokens: providerMetadata.outputTokens ?? result.usage?.output ?? null,
        sourceCount: result.content.sources.length,
        elapsedMs: Date.now() - startedAt,
      })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        ok: false,
        model: configuration.model,
        topLevelRequests: 1,
        category: error instanceof TopicAiError ? error.category : 'unexpected',
        ...providerMetadata,
        elapsedMs: Date.now() - startedAt,
      })}\n`);
      process.exitCode = 1;
    }
  }
}
