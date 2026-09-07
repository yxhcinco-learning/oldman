// Isolated UI fixtures; real HTTP, SQLite and sharp are covered separately.
/* eslint-disable @typescript-eslint/no-require-imports -- evaluate callbacks execute in DevTools CommonJS. */
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.MINI_AUTOMATOR_PATH || !process.env.MINI_QA_OUTPUT || !process.env.MINI_QA_COVER) throw new Error('请指定独立 automator、截图目录及合成封面。');
const mini = await createRequire(import.meta.url)(process.env.MINI_AUTOMATOR_PATH).connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
const output = resolve(process.env.MINI_QA_OUTPUT); await mkdir(output, { recursive: true });
const passed = [], exceptions = [];
mini.on('exception', value => exceptions.push(value));
const check = (label, value) => { assert.ok(value, label); passed.push(label); };
async function waitFor(test) { for (let i = 0; i < 60; i++) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('界面状态未准备好'); }
let installed = false;
try {
  await waitFor(async () => { const p = await mini.currentPage(); return !!p && p.path !== 'pages/launch/index'; });
  const page = await mini.currentPage();
  assert.ok(['pages/login/index', 'pages/home/index'].includes(page.path), '从登录页或首页启动，避免打断编辑');
  const source = (await readFile(process.env.MINI_QA_COVER)).toString('base64');
  const info = await mini.systemInfo();
  if (process.env.MINI_QA_EXPECTED_WIDTH) assert.equal(info.windowWidth, Number(process.env.MINI_QA_EXPECTED_WIDTH));
  await mini.evaluate(async source => {
    const serviceModule = require('services.js'), services = serviceModule.miniServices();
    if (services.account.snapshot().account) throw new Error('请在游客状态启动隔离 UI 夹具');
    serviceModule.pauseMiniServices();
    const root = wx.env.USER_DATA_PATH + '/qa-publication-' + Date.now(), fs = wx.getFileSystemManager();
    fs.mkdirSync(root, true); fs.writeFileSync(root + '/cover.jpg', source, 'base64');
    const original = { repository: services.repository, writer: services.writer, publicationStorage: services.publicationStorage,
      publications: services.publications, snapshot: services.account.snapshot, updateNickname: services.account.updateNickname,
      restore: services.account.restore, sync: services.sync.sync, platformRequest: services.account.platform.request, platformLogin: services.account.platform.login };
    const core = require('domain/core.js'), repo = require('storage/repository.js');
    services.repository = new repo.MiniWorkRepository(services.files, root + '/account', undefined, 'qa-publication');
    services.writer = new repo.MiniDraftWriter(services.repository);
    services.publicationStorage = new (require('publication/storage.js').MiniPublicationStorage)(new (require('publication/storage.js').WxPublicationFiles)(), root + '/account');
    const qa = { original, services, root, nickname: '岁月作者000001', unavailable: false, status: null, draft: null };
    services.account.snapshot = () => ({ status: 'authenticated', account: { id: 'qa-publication', nickname: qa.nickname, hasAvatar: false, avatarVersion: 0 }, error: '' });
    services.account.restore = async () => {};
    services.account.updateNickname = async name => { qa.nickname = name; };
    services.sync.sync = async () => {};
    services.account.platform.request = async () => { throw new Error('UI 夹具禁止真实账号网络请求'); };
    services.account.platform.login = async () => { throw new Error('UI 夹具禁止真实微信登录'); };
    const draft = { ...core.emptyDraft(), title: '老街的清晨', inputMode: 'text', textDraft: '小时候，我们沿着老街走过四季。\n\n清晨的风轻轻掠过门前的树叶，街坊的招呼声从巷口传来。那些平常的温暖，一直留在我的记忆里。', pendingVoice: '未确认的私有语音' };
    qa.draft = draft;
    await services.repository.save(draft, 0);
    const operation = await services.repository.queueMutation(draft.id);
    await services.repository.acknowledge(draft.id, { operationId: operation.operationId, entry: { id: draft.id, version: 1, sequence: 1,
      title: '', updatedAt: draft.updatedAt, deletedAt: null, purged: false } });
    qa.status = { workId: draft.id, articleId: 'qa-article', version: 0, settings: { version: 0, assetId: null, crops: null }, pending: null, published: false, lastSubmission: null, reason: '' };
    const bytes = () => fs.readFileSync(root + '/cover.jpg');
    const article = () => ({ id: 'qa-article', title: draft.title, body: draft.textDraft, authorName: qa.nickname, aiAssisted: true, version: 3, publishedAt: '2026-09-07T00:00:00Z' });
    services.publications = {
      status: async () => qa.status, statuses: async () => ({ publications: [qa.status] }),
      upload: async () => ({ assetId: 'qa-upload', width: 1000, height: 800, crops: core.centeredCrops(1000, 800) }),
      settings: async (_id, input) => { qa.status.settings = { version: 1, assetId: 'qa-cropped', crops: input.crops }; return { assetId: 'qa-cropped', settingsVersion: 1 }; },
      preview: async () => ({ ...article(), articleId: 'qa-article', assetId: 'qa-cropped', workVersion: 1, settingsVersion: 1, version: qa.status.version }),
      ownImage: async () => bytes(), image: async () => { if (qa.unavailable) throw new Error('这篇文章暂时无法查看。'); return bytes(); },
      submit: async (_id, input) => { qa.submissionInput = input; qa.status.pending = { id: 'qa-submission', state: 'pending', reason: '', createdAt: '2026-09-07T00:00:00Z' }; qa.status.version++; return { articleId: 'qa-article', submissionId: 'qa-submission', version: qa.status.version }; },
      action: async () => { qa.status.pending = null; qa.status.published = false; qa.status.version++; return { version: qa.status.version }; },
      list: async () => ({ articles: [article()], cursor: null }), article: async () => { if (qa.unavailable) throw new Error('这篇文章暂时无法查看。'); return article(); },
    };
    getApp().__publicationQa = qa;
    require('auth/navigation.js').clearLoginReturn();
  }, source);
  installed = true;
  const id = await mini.evaluate(() => getApp().__publicationQa.draft.id);
  let current = await mini.reLaunch('/pages/publish/index?id=' + id);
  await waitFor(async () => !!await current.data('title'));
  await mini.evaluate(async () => { const qa = getApp().__publicationQa, page = getCurrentPages().at(-1); await page.controller.choose(qa.root + '/cover.jpg', 1000, 800); await page.local(); });
  await waitFor(async () => !!await current.$('.publication-cropper'));
  let cropper = await current.$('.publication-cropper');
  await cropper.callMethod('enlarge'); await waitFor(async () => !await current.data('busy'));
  check('封面可放大移动，裁切有实际画面', await cropper.data('zoom') > 1);
  await current.callMethod('confirmCrop');
  await current.callMethod('changeCropKind', { currentTarget: { dataset: { kind: 'reading' } } });
  cropper = await current.$('.publication-cropper');
  const cropWindow = await (await cropper.$('.crop-window')).size();
  check('阅读与好友裁切窗口为 5:4 且不超过屏宽', Math.abs(cropWindow.width / cropWindow.height - 1.25) < .01 && cropWindow.width <= info.windowWidth - 40);
  await current.callMethod('confirmCrop');
  check('两种裁切分别确认并保存', (await current.data('draft')).confirmed.length === 2);
  await mini.screenshot({ path: resolve(output, 'cover-settings.png') });
  await current.callMethod('preparePreview');
  await waitFor(async () => await current.data('mode') === 'preview');
  const cover = await (await current.$('.reading-cover')).size();
  check('预览封面为 5:4', Math.abs(cover.width / cover.height - 1.25) < .01);
  check('预览只含确认正文，不含待确认语音', !(await current.data('preview')).body.includes('未确认'));
  await mini.screenshot({ path: resolve(output, 'article-preview.png') });
  await current.callMethod('editName');
  const username = await current.$('.publication-username');
  check('修改用户名复用组件并填入当前用户名', await username.data('input') === '岁月作者000001');
  await username.callMethod('inputName', { detail: { value: '老街写作者' } }); await username.callMethod('save');
  await waitFor(async () => !await current.data('editingName') && !await current.data('busy'));
  check('改名后保留文章和封面，并刷新预览署名', (await current.data('preview')).authorName === '老街写作者' && !!(await current.data('draft')).path);
  await current.callMethod('submit');
  await waitFor(async () => await current.data('mode') === 'result');
  check('提交结果显示已提交审核且保持待审', (await current.data('status')).pending && !(await current.data('status')).published);
  check('提交使用最后预览的署名', await mini.evaluate(() => getApp().__publicationQa.submissionInput.authorName) === '老街写作者');
  await mini.screenshot({ path: resolve(output, 'submitted.png') });
  await current.callMethod('myArticles');
  await waitFor(async () => (await mini.currentPage()).path === 'pages/works/index'); current = await mini.currentPage();
  await waitFor(async () => (await current.data('visible'))?.length === 1);
  check('我的文章每篇作品只有一条记录并显示审核状态', (await current.data('visible'))[0].publication === '审核中');
  await mini.screenshot({ path: resolve(output, 'my-articles.png') });
  current = await mini.switchTab('/pages/articles/index');
  await waitFor(async () => (await current.data('cards'))?.length === 1);
  await mini.screenshot({ path: resolve(output, 'public-list.png') });
  current = await mini.navigateTo('/pages/article/index?id=qa-article');
  await waitFor(async () => await current.data('shareReady'));
  const readerCover = await (await current.$('.reading-cover')).size();
  check('阅读页 5:4 图片与明确好友分享按钮', Math.abs(readerCover.width / readerCover.height - 1.25) < .01 && !!await current.$('.share-button'));
  const share = await current.callMethod('onShareAppMessage');
  check('分享使用稳定文章 ID 与处理后本地图片', share.path === '/pages/article/index?id=qa-article' && share.imageUrl.includes('/publication/article-'));
  await mini.screenshot({ path: resolve(output, 'public-article.png') });
  await mini.evaluate(() => { getApp().__publicationQa.unavailable = true; });
  await current.callMethod('refresh');
  check('下架后统一不可用，清空正文与分享入口', !await current.data('article') && !await current.data('shareReady') && !!await current.data('error'));
  await mini.screenshot({ path: resolve(output, 'unavailable.png') });
  check('页面无运行时异常', exceptions.length === 0);
  console.info(JSON.stringify({ width: info.windowWidth, height: info.screenHeight, passed }));
} catch (error) {
  if (installed) await mini.screenshot({ path: resolve(output, 'failed.png') }).catch(() => {});
  console.error(JSON.stringify({ passed, error: String(error) }));
  throw error;
} finally {
  if (installed) {
    await mini.evaluate(() => {
      const qa = getApp().__publicationQa; if (!qa) return;
      const { services: s, original: o } = qa;
      s.repository = o.repository; s.writer = o.writer; s.publicationStorage = o.publicationStorage; s.publications = o.publications;
      s.account.snapshot = o.snapshot; s.account.updateNickname = o.updateNickname; s.account.restore = o.restore;
      s.account.platform.request = o.platformRequest; s.account.platform.login = o.platformLogin; s.sync.sync = o.sync;
      delete getApp().__publicationQa; require('auth/navigation.js').clearLoginReturn();
    });
    await mini.reLaunch('/pages/login/index');
  }
  await writeFile(resolve(output, 'mini-report.json'), JSON.stringify({ passed, exceptions }, null, 2));
  await mini.disconnect();
}
