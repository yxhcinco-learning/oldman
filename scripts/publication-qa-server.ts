/** Explicit local UI fixture: isolated databases, synthetic text, no paid upstream. */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { MiniIdentityStore } from '../server/mini-identity-store';
import { WechatAuthService } from '../server/wechat-auth';
import { TopicStore } from '../server/topic-store';
import { TopicAdminAuthService, createTopicAdminPasswordHash } from '../server/topic-admin-auth';
import { createGateway } from '../server/gateway';
import { emptyDraft, workFromDraft, emptyWritingState, newSession } from '../packages/core/src/index';

if (!process.env.SUIYUE_PUBLICATION_QA_OUTPUT) throw new Error('请显式指定独立 QA 输出目录。');
const output = resolve(process.env.SUIYUE_PUBLICATION_QA_OUTPUT);
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'database-'));
const identity = new MiniIdentityStore({ path: join(directory, 'auth.sqlite') });
const topics = new TopicStore({ path: join(directory, 'topics.sqlite') });
const service = new WechatAuthService({ appId: 'publication-local-qa' }, identity, { exchange: async code => ({ appId: 'publication-local-qa', openid: code.split(':')[0]! }) });
const auth = new TopicAdminAuthService(topics, { username: 'reviewer', passwordHash: createTopicAdminPasswordHash('local-publication-qa-only'), secureCookie: false, sessionDurationMs: 3600_000 });
const app = await createGateway({ origin: 'http://localhost:3811', miniAuth: { service }, topics, topicAdmin: { auth }, operations: () => {} });
const login = await app.inject({ method: 'POST', url: '/api/mini/account/login', payload: { code: 'author:' + randomUUID() } });
const headers = { authorization: 'Bearer ' + login.json().token };
const cover = await sharp(Buffer.from('<svg width="1000" height="800"><rect width="1000" height="800" fill="#e8dfc4"/><rect y="490" width="1000" height="310" fill="#718375"/><circle cx="730" cy="230" r="90" fill="#e8b76b"/><path d="M80 500 L260 290 L440 500Z" fill="#355847"/><rect x="140" y="485" width="260" height="140" fill="#b88b60"/></svg>')).jpeg().toBuffer();
await writeFile(join(output, 'cover.jpg'), cover);
const works = [];
for (const [index, title] of ['老街的清晨', '回家的那班慢车', '一碗热汤的记忆'].entries()) {
  const draft = { ...emptyDraft(), title, inputMode: 'text' as const, textDraft: '小时候，我们沿着老街走过四季。\n\n清晨的风轻轻掠过门前的树叶，街坊的招呼声从巷口传来。那时的日子很慢，一碗热汤，一张旧桌子，就能让人安心坐上很久。\n\n如今再回到这里，我仍记得那些平常的温暖。', pendingVoice: '未确认语音仅私有' };
  const snapshot = { work: workFromDraft(draft), session: newSession(draft), writingState: { ...emptyWritingState(), composer: '未投稿会话仅私有' } };
  await app.inject({ method: 'POST', url: '/api/mini/works/mutations', headers, payload: { operationId: randomUUID(), workId: draft.id, kind: 'create', baseVersion: 0, snapshot } });
  const base = '/api/mini/publications/' + draft.id;
  const upload = (await app.inject({ method: 'POST', url: base + '/images/' + randomUUID(), headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: cover })).json();
  await app.inject({ method: 'PUT', url: base + '/settings', headers, payload: { operationId: randomUUID(), expectedVersion: 0, assetId: upload.assetId, crops: upload.crops } });
  const preview = (await app.inject({ url: base + '/preview', headers })).json();
  const submitted = (await app.inject({ method: 'POST', url: base + '/submissions', headers, payload: { operationId: randomUUID(), expectedVersion: preview.version, workVersion: preview.workVersion, settingsVersion: preview.settingsVersion, authorName: preview.authorName } })).json();
  works.push({ workId: draft.id, articleId: submitted.articleId, submissionId: submitted.submissionId, index });
}
await writeFile(join(output, 'fixture.json'), JSON.stringify({ works, cover: join(output, 'cover.jpg') }, null, 2));
await app.listen({ port: 3812, host: '127.0.0.1' });
console.info('本地文章审核夹具已就绪：127.0.0.1:3812（独立 SQLite，无外部调用）');
const close = async () => { await app.close(); identity.close(); topics.close(); };
process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
