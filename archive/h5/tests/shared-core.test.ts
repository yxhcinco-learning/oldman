import { describe, expect, it } from 'vitest';
import * as sharedWriting from '../packages/core/src/writing.js';
import * as webWriting from '../lib/domain/writing';
import * as sharedAi from '../packages/core/src/ai-protocol.js';
import * as webAi from '../features/ai/protocol';

describe('Web 兼容入口与共享核心', () => {
  it('复用同一份写作实现', () => {
    expect(webWriting.emptyDraft).toBe(sharedWriting.emptyDraft);
    expect(webWriting.workFromDraft).toBe(sharedWriting.workFromDraft);
  });

  it('复用同一份 AI 协议限制', () => {
    expect(webAi.aiRequestSchema).toBe(sharedAi.aiRequestSchema);
    expect(webAi.MAX_CONTEXT_CHARS).toBe(sharedAi.MAX_CONTEXT_CHARS);
  });
});
