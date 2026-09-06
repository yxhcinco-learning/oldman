import { describe, expect, it } from 'vitest';
import { AI_ASSISTANCE_DISCLOSURE, aiDisclosureFor, externalArticleText, isAppliedAiVersion, isWorkAiAssisted,
  newSession, newVersion, type ArticleSession } from '../lib/domain/article-ai';
import { makeBackup, parseBackupBundle } from '../lib/storage/backup';
import { emptyDraft, splitDraft, workFromDraft } from '../lib/domain/writing';

function fixture(status: 'ready' | 'dismissed' | 'applied'): { session: ArticleSession; candidateVersionId?: string } {
  const draft = { ...emptyDraft(), title: '一段往事', inputMode: 'text' as const, textDraft: '这是我的原文。' };
  const session = newSession(draft);
  const result = { answer: '整理了句子。', body: '这是整理后的正文。', citedVersionIds: [] };
  if (status !== 'applied') {
    session.turns.push({ id: `turn-${status}`, createdAt: new Date().toISOString(), action: 'chat', prompt: '帮我整理',
      inputVersionId: session.versions[0].id, status, result });
    return { session };
  }
  const next = { ...draft, textDraft: result.body, segments: splitDraft(result.body) };
  const version = newVersion(next, 'rewrite');
  session.versions.push(version);
  session.turns.push({ id: 'turn-applied', createdAt: new Date().toISOString(), action: 'chat', prompt: '帮我整理',
    inputVersionId: session.versions[0].id, status, result, appliedVersionId: version.id });
  return { session, candidateVersionId: version.id };
}

describe('AI 辅助来源与导出披露', () => {
  it('只把明确应用的完整候选判定为 AI 辅助', () => {
    expect(isWorkAiAssisted(fixture('ready').session)).toBe(false);
    expect(isWorkAiAssisted(fixture('dismissed').session)).toBe(false);
    const applied = fixture('applied');
    expect(isWorkAiAssisted(applied.session)).toBe(true);
    expect(isAppliedAiVersion(applied.session, applied.candidateVersionId!)).toBe(true);
  });

  it('应用后的手改和恢复不会抹掉历史披露', () => {
    const { session } = fixture('applied');
    const manual = { ...emptyDraft(), id: session.workId, title: '手改标题', inputMode: 'text' as const, textDraft: '后来又手工改过。' };
    session.versions.push(newVersion(manual, 'manual'), newVersion({ ...manual, textDraft: '恢复后的内容。' }, 'restore'));
    expect(isWorkAiAssisted(session)).toBe(true);
    expect(externalArticleText('恢复后的内容。', session)).toBe(`${AI_ASSISTANCE_DISCLOSURE}\n\n恢复后的内容。`);
  });

  it('v4 备份保存并校验机器可读和用户可读披露，旧 v3 可确定性推导', () => {
    const draft = { ...emptyDraft(), title: '一段往事', inputMode: 'text' as const, textDraft: '这是整理后的正文。' };
    const { session } = fixture('applied');
    const work = workFromDraft({ ...draft, id: session.workId });
    const raw = makeBackup([work], null, [session]);
    const encoded = JSON.parse(raw) as { schemaVersion: number; disclosures: Array<Record<string, unknown>> };
    expect(encoded.schemaVersion).toBe(5);
    expect(encoded.disclosures[0]).toMatchObject({ workId: work.id, aiAssisted: true, basis: 'applied-ai-candidate', appliedCandidateCount: 1,
      notice: AI_ASSISTANCE_DISCLOSURE });
    expect(parseBackupBundle(raw).disclosures).toEqual([aiDisclosureFor(work.id, session)]);

    const legacy = { ...encoded, schemaVersion: 3 } as Record<string, unknown>;
    delete legacy.disclosures;
    expect(parseBackupBundle(JSON.stringify(legacy)).disclosures[0]?.aiAssisted).toBe(true);
  });

  it('拒绝与会话来源不一致的伪造披露', () => {
    const draft = { ...emptyDraft(), title: '用户原文', inputMode: 'text' as const, textDraft: '完全由用户写。' };
    const raw = JSON.parse(makeBackup([workFromDraft(draft)])) as { disclosures: Array<Record<string, unknown>> };
    raw.disclosures[0].aiAssisted = true;
    raw.disclosures[0].basis = 'applied-ai-candidate';
    raw.disclosures[0].appliedCandidateCount = 1;
    raw.disclosures[0].notice = AI_ASSISTANCE_DISCLOSURE;
    expect(() => parseBackupBundle(JSON.stringify(raw))).toThrow('AI 披露');
  });
});
