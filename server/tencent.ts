import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { TranscriptAccumulator } from '../packages/core/src/speech-protocol';

export interface Credentials { appId: string; secretId: string; secretKey: string; token?: string }
export const ASR_ENGINE_MODELS = ['16k_zh', '16k_zh_en', '16k_zh_en_2.0'] as const;
export type AsrEngineModel = typeof ASR_ENGINE_MODELS[number];

export function loadAsrEngineModel(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AsrEngineModel {
  const configured = env.TENCENT_ASR_ENGINE_MODEL_TYPE?.trim() || '16k_zh';
  if (!ASR_ENGINE_MODELS.includes(configured as AsrEngineModel)) {
    throw new Error(`TENCENT_ASR_ENGINE_MODEL_TYPE must be one of: ${ASR_ENGINE_MODELS.join(', ')}`);
  }
  return configured as AsrEngineModel;
}

interface SignedAsrOptions {
  engineModel?: AsrEngineModel;
  now?: number;
  voiceId?: string;
  nonce?: number;
}

/** Fixed provider endpoint. Never log or return the signed URL to a browser. */
export function signedAsrUrl(credentials: Credentials, options: SignedAsrOptions = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const voiceId = options.voiceId ?? randomUUID();
  const nonce = options.nonce ?? randomInt(1, 2 ** 30);
  const params: Record<string, string> = { engine_model_type: options.engineModel ?? '16k_zh', expired: String(now + 600), nonce: String(nonce), secretid: credentials.secretId,
    timestamp: String(now), voice_format: '1', voice_id: voiceId };
  if (credentials.token) params.token = credentials.token;
  const keys = Object.keys(params).sort();
  const path = `asr.cloud.tencent.com/asr/v2/${credentials.appId}`;
  const canonical = `${path}?${keys.map(key => `${key}=${params[key]}`).join('&')}`;
  const signature = createHmac('sha1', credentials.secretKey).update(canonical).digest('base64');
  return `wss://${path}?${keys.map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')}&signature=${encodeURIComponent(signature)}`;
}
export function parseTencentResult(value: unknown, accumulator: TranscriptAccumulator) {
  if (!value || typeof value !== 'object') throw new Error('Invalid upstream response');
  const data = value as Record<string, unknown>;
  if (data.code !== 0) throw new Error('Provider rejected recognition');
  let changed = false;
  let final = false;
  const result = data.result as Record<string, unknown> | undefined;
  if (result && Number.isInteger(result.index) && typeof result.voice_text_str === 'string') {
    accumulator.accept(result.index as number, result.voice_text_str, result.slice_type === 2);
    changed = true; final = result.slice_type === 2;
  }
  // Also accepts the current provider sentence-list response without coupling UI to it.
  const sentences = data.sentences as { sentence_list?: unknown[] } | undefined;
  if (Array.isArray(sentences?.sentence_list)) for (const item of sentences.sentence_list) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (Number.isInteger(s.sentence_id) && typeof s.sentence === 'string') {
      accumulator.accept(s.sentence_id as number, s.sentence, s.sentence_type === 1);
      changed = true; final = s.sentence_type === 1;
    }
  }
  return { changed, text: accumulator.text, final, done: data.final === 1 };
}
