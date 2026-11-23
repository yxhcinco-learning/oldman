// Real DevTools pages and files; account, HTTP, modal and keyboard events are isolated substitutes.
/* eslint-disable @typescript-eslint/no-require-imports -- callbacks execute inside DevTools. */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.MINI_AUTOMATOR_PATH || !process.env.MINI_QA_OUTPUT || !process.env.MINI_QA_COVER || !process.env.MINI_QA_EXPECTED_WIDTH) throw new Error('需要独立 automator、截图目录、合成封面和实际窗口宽度。');
const mini = await createRequire(import.meta.url)(process.env.MINI_AUTOMATOR_PATH).connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
const output = resolve(process.env.MINI_QA_OUTPUT); await mkdir(output, { recursive: true });
const passed = [], exceptions = [], layoutEvidence = {};
mini.on('exception', value => exceptions.push(value));
const check = (name, value) => { assert.ok(value, name); passed.push(name); };
const wait = async test => { for (let i = 0; i < 80; i++) { if (await test()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('页面未就绪'); };
let installed = false;
try {
  await wait(async () => ['pages/login/index', 'pages/home/index'].includes((await mini.currentPage())?.path));
  const info = await mini.systemInfo();
  assert.equal(info.windowWidth, Number(process.env.MINI_QA_EXPECTED_WIDTH));
  const cover = (await readFile(process.env.MINI_QA_COVER)).toString('base64');
  await mini.evaluate(async image => {
    const serviceModule = require('services.js'), s = serviceModule.miniServices();
    if (s.account.snapshot().account) throw new Error('只能从无真实账号的页面安装隔离夹具');
    serviceModule.pauseMiniServices();
    const saved = { repository: s.repository, writer: s.writer, social: s.social, publicationStorage: s.publicationStorage, publicImages: s.publicImages, publications: s.publications,
      snapshot: s.account.snapshot, subscribe: s.account.subscribe, restore: s.account.restore, refresh: s.account.refresh, login: s.account.login, sync: s.sync.sync, platformRequest: s.account.platform.request, platformLogin: s.account.platform.login };
    const root = wx.env.USER_DATA_PATH + '/qa-social-' + Date.now(), fs = wx.getFileSystemManager(); fs.mkdirSync(root, true); fs.writeFileSync(root + '/cover.jpg', image, 'base64');
    const repo = require('storage/repository.js'); s.repository = new repo.MiniWorkRepository(s.files, root, undefined, 'qa-social-account'); s.writer = new repo.MiniDraftWriter(s.repository);
    const core = require('domain/core.js');
    for (const title of ['老街的清晨', '家门前的桂花树', '旧相册里的一次旅行']) await s.repository.save({ ...core.emptyDraft(), title, inputMode: 'text', textDraft: '那些平常的温暖，一直留在我的记忆里。' }, 0);
    const storage = require('publication/storage.js'); s.publicationStorage = new storage.MiniPublicationStorage(new storage.WxPublicationFiles(), root); s.publicImages = s.publicationStorage;
    const q = { s, saved, root, logged: false, generation: s.generation, counts: { likes: 0, comments: 1, flowers: 0 }, like: { active: false, version: 0 }, collection: { active: true, version: 1 },
      relationship: { active: false, followedBy: true, mutual: false, version: 0, self: false }, wallet: { balance: 3, version: 1, today: '2026-09-09', claimedToday: true, dailyAmount: 3 },
      own: [], requests: [], receipts: {}, fail: '', unavailable: false, loginFail: false, loginCount: 0, empty: false };
    q.article = { id: 'qa-social-article', publicAuthorId: 'qa-social-author', authorName: '陈静', title: '老街的清晨', body: Array(16).fill('清晨的风轻轻掠过门前的树叶，街坊的招呼声从巷口传来。那些平常的温暖，一直留在我的记忆里。').join('\n\n'), aiAssisted: false, publishedAt: '2026-09-09T00:00:00Z', version: 1, audienceVersion: 1, counts: q.counts };
    q.comment = { id: 'qa-social-comment', articleId: q.article.id, publicAuthorId: 'qa-social-other', authorName: '林老师', avatar: 'default', text: '读到这里，我也想起了老街的清晨。', createdAt: '2026-09-09T01:00:00Z', version: 1 };
    q.profile = () => ({ id: q.article.publicAuthorId, name: '陈静是一位喜欢记录生活的老街写作者', avatar: 'default', following: 12, followers: 28, articles: 1, flowers: q.counts.flowers, ...(q.logged ? { relationship: q.relationship } : {}) });
    s.account.snapshot = () => ({ status: q.logged ? 'authenticated' : 'guest', account: q.logged ? { id: 'qa-social-account', nickname: '岁月作者000001', hasAvatar: false, avatarVersion: 0 } : null, generation: q.generation, error: '' });
    q.listeners = new Set(); s.account.subscribe = fn => { q.listeners.add(fn); return () => q.listeners.delete(fn); };
    s.account.restore = async () => {}; s.account.refresh = async () => {};
    s.account.login = async () => { q.loginCount++; q.generation++; if (q.loginFail) throw new Error('隔离登录失败'); q.logged = true; };
    s.sync.sync = async () => {}; s.publications = { statuses: async () => ({ publications: [] }) };
    s.account.platform.request = async () => { throw new Error('隔离验收禁止真实账号请求'); }; s.account.platform.login = async () => { throw new Error('隔离验收禁止真实微信换码'); };
    const request = async (path, method, token, body, binary) => {
      q.requests.push({ path, method, authenticated: !!token });
      if (q.fail && path.endsWith(q.fail)) throw new Error('隔离网络失败');
      if (path.includes('/social/events')) return { statusCode: 200, data: { recorded: true } };
      if (path.startsWith('/api/mini/') && !q.logged) return { statusCode: 401, data: { code: 'invalid_session', error: '请登录' } };
      if (q.unavailable && path.includes('/articles/')) return { statusCode: 404, data: { code: 'article_unavailable', error: '这篇文章暂时无法查看。' } };
      let data;
      if (binary) data = fs.readFileSync(root + '/cover.jpg');
      else if (path.endsWith('/engagement')) data = { articleId: q.article.id, counts: q.counts, like: q.like, collection: q.collection, relationship: q.relationship, wallet: q.wallet, ownComments: q.own, writesEnabled: true, commentsEnabled: true };
      else if (path.endsWith('/like') || path.endsWith('/collection')) { const key = path.endsWith('/like') ? 'like' : 'collection'; q[key] = { active: body.active, version: q[key].version + 1 }; if (key === 'like') q.counts.likes = body.active ? 1 : 0; data = { ...q[key], counts: q.counts }; }
      else if (path.endsWith('/follow')) { q.relationship = { ...q.relationship, active: body.active, version: q.relationship.version + 1, mutual: body.active && q.relationship.followedBy }; data = q.relationship; }
      else if (path.endsWith('/comments') && method === 'POST') { data = q.receipts[body.operationId]; if (!data) { data = { ...q.comment, id: 'qa-own-' + q.own.length, authorName: '岁月作者000001', text: body.text, state: 'pending', reason: '' }; q.own.push(data); q.receipts[body.operationId] = data; } }
      else if (path.endsWith('/comments')) data = { comments: q.empty ? [] : [q.comment], cursor: null };
      else if (path.endsWith('/gifts')) { data = q.receipts[body.operationId]; if (!data) { q.wallet.balance--; q.counts.flowers++; data = { operationId: body.operationId, articleId: q.article.id, gift: 'flower', sent: true, balance: q.wallet.balance, flowers: q.counts.flowers }; q.receipts[body.operationId] = data; } }
      else if (path.endsWith('/reports')) data = { reported: true };
      else if (path.endsWith('/delete')) { q.own = []; data = { deleted: true }; }
      else if (path.endsWith('/flowers') || path.endsWith('/flowers/claim')) data = q.wallet;
      else if (path.endsWith('/me/social')) data = { publicAuthorId: 'qa-social-self', following: 1, followers: 1, mutuals: 1 };
      else if (path.includes('/flowers/history')) data = { entries: [], cursor: null };
      else if (path.includes('/me/collections')) data = { collections: q.empty || !q.collection.active ? [] : [{ articleId: q.article.id, article: { ...q.article, excerpt: '小时候，我们沿着老街走过四季。' }, available: true, version: q.collection.version, collectedAt: '2026-09-09T01:00:00Z' }], cursor: null };
      else if (/\/me\/(following|followers|mutuals)/.test(path)) data = { authors: q.empty ? [] : [{ ...q.profile(), relationship: q.relationship }], cursor: null };
      else if (path.includes('/authors/') && path.endsWith('/articles')) data = { articles: q.empty ? [] : [{ ...q.article, excerpt: '小时候，我们沿着老街走过四季。' }], cursor: null };
      else if (path.includes('/authors/')) data = q.profile();
      else if (path.endsWith('/articles/' + q.article.id)) data = q.article;
      else throw new Error('未登记的隔离请求');
      return { statusCode: 200, data: binary ? data : JSON.parse(JSON.stringify(data)) };
    };
    s.social = new (require('social/client.js').MiniSocialClient)({ authorizedRequest: run => run('qa-only-token') }, { request });
    getApp().__socialQa = q;
  }, cover); installed = true;
  await mini.mockWxMethod('showModal', { confirm: true, cancel: false });
  await mini.mockWxMethod('showActionSheet', { tapIndex: 0 });
  let page;
  const open = async (url, key) => { page = await mini.reLaunch(url); await wait(async () => !await page.data('loading') && (!key || !!await page.data(key))); await new Promise(r => setTimeout(r, 500)); return page; };
  const capture = async name => { await new Promise(r => setTimeout(r, 250)); await mini.screenshot({ path: resolve(output, name + '.png') }); };
  const rectangle = async item => {
    const offset = await item.offset(), size = await item.size();
    return { left: Number(offset.left), top: Number(offset.top), width: Number(size.width), height: Number(size.height) };
  };
  const box = async selector => { const item = await page.$(selector); assert.ok(item, selector); return rectangle(item); };
  await open('/pages/article/index?id=qa-social-article&source=share', 'article');
  try { await wait(async () => await page.data('shareReady')); }
  catch { throw new Error('分享入口未就绪：' + (await page.data('socialError') || await page.data('error') || '未知原因')); }
  check('游客直读正文且不换码', !await page.data('logged') && await mini.evaluate(() => getApp().__socialQa.loginCount === 0));
  check('游客读取仅发独立公开请求', await mini.evaluate(() => getApp().__socialQa.requests.every(r => r.path.startsWith('/api/public/') && !r.authenticated)));
  const dock = await box('.social-dock'); check('阅读底栏位于实际屏宽内', dock.left >= 0 && dock.left + dock.width <= info.windowWidth + 1);
  const dockActions = await page.$$('.social-dock .dock-action');
  check('已核验文章在固定底栏显示原生分享入口', dockActions.length === 4 && await dockActions[3].attribute('open-type') === 'share');
  const dockComment = await page.$('.social-dock .dock-comment'); assert.ok(dockComment);
  const initialDockItems = [await rectangle(dockComment), ...await Promise.all(dockActions.map(rectangle))];
  layoutEvidence.initial = { dock, items: initialDockItems };
  check('底栏五个入口触控区至少48px且首屏可见', initialDockItems.every(item => item.width >= 48 && item.height >= 48 && item.left >= 0 && item.top >= 0 && item.left + item.width <= info.windowWidth + 1 && item.top + item.height <= info.windowHeight + 1));
  check('底栏五个入口从左到右互不重叠', initialDockItems.every((item, index) => !index || initialDockItems[index - 1].left + initialDockItems[index - 1].width <= item.left + 1));
  await capture('reader-guest');
  await mini.pageScrollTo(2000); await new Promise(r => setTimeout(r, 250));
  const scrolledDock = await box('.social-dock'), scrolledActions = await page.$$('.social-dock .dock-action'), scrolledComment = await page.$('.social-dock .dock-comment'); assert.ok(scrolledComment);
  const scrolledDockItems = [await rectangle(scrolledComment), ...await Promise.all(scrolledActions.map(rectangle))];
  layoutEvidence.scrolled = { dock: scrolledDock, items: scrolledDockItems };
  check('长文滚动后底栏及分享仍固定可见', Math.abs(scrolledDock.top - dock.top) <= 1 && scrolledDockItems.length === 5 && scrolledDockItems.every(item => item.top >= 0 && item.top + item.height <= info.windowHeight + 1));
  await capture('reader-scrolled');
  await scrolledComment.tap(); await wait(async () => await page.data('sheet') === 'comments');
  check('实际点击底栏评论入口可打开评论面板', await page.data('sheet') === 'comments');
  await page.callMethod('inputComment', { detail: { value: '一段登录前的评论' } });
  await page.callMethod('publishComment'); await wait(async () => (await mini.currentPage()).path === 'pages/login/index'); page = await mini.currentPage();
  check('明确发布才进入可取消登录', !!await page.data('socialReturn'));
  await page.callMethod('cancel'); await wait(async () => (await mini.currentPage()).path === 'pages/article/index'); page = await mini.currentPage(); await wait(async () => !!await page.data('article'));
  check('取消登录保留评论草稿且未发布', await page.data('draft') === '一段登录前的评论' && await mini.evaluate(() => getApp().__socialQa.own.length === 0));
  await page.callMethod('publishComment'); await wait(async () => (await mini.currentPage()).path === 'pages/login/index'); page = await mini.currentPage();
  await mini.evaluate(() => { getApp().__socialQa.loginFail = true; }); await page.callMethod('login');
  check('登录失败保留原登录页和重试', (await mini.currentPage()).path === 'pages/login/index' && !!await page.data('error'));
  await mini.evaluate(() => { getApp().__socialQa.loginFail = false; });
  await page.callMethod('login'); await wait(async () => (await mini.currentPage()).path === 'pages/article/index'); page = await mini.currentPage(); await wait(async () => !!await page.data('engagement'));
  check('评论登录后回编辑且不自动发送', await page.data('draft') === '一段登录前的评论' && await page.data('sheet') === 'comments' && await mini.evaluate(() => getApp().__socialQa.own.length === 0));
  await page.callMethod('publishComment'); await wait(async () => !await page.data('busy'));
  check('再次发布显示本人审核中', (await page.data('comments')).some(c => c.stateLabel?.includes('审核中')) && await page.data('draft') === '');
  const close = await box('.social-sheet-head .social-icon-button');
  await capture('comments-pending');
  const styleEvidence = {};
  for (const selector of ['.social-sheet-head', '.social-sheet-head .social-icon-button', '.comment-person']) {
    const element = await page.$(selector); styleEvidence[selector] = {};
    for (const property of ['display', 'width', 'margin-left', 'margin-right', 'justify-content', 'flex']) styleEvidence[selector][property] = await element.style(property);
  }
  await writeFile(resolve(output, 'comment-styles.json'), JSON.stringify(styleEvidence, null, 2));
  check(`评论关闭按钮贴近面板右侧 ${JSON.stringify({ close, width: info.windowWidth })}`, close.left + close.width >= info.windowWidth - 26 && close.left + close.width <= info.windowWidth);
  await page.callMethod('keyboard', { detail: { height: 260 } });
  const panel = await box('.social-sheet'), submit = await box('.comment-compose-bottom .primary-action');
  await capture('comments-keyboard-substitute');
  const capsule = await mini.evaluate(() => wx.getMenuButtonBoundingClientRect());
  const keyboardClose = await box('.social-sheet-head .social-icon-button');
  check('键盘下关闭按钮避开微信胶囊', keyboardClose.top >= capsule.bottom + 4);
  check('短屏键盘事件下评论面板及发布仍在可视区', panel.top >= 0 && submit.height >= 48 && submit.top >= 0 && submit.top + submit.height <= info.windowHeight - 260 + 2);
  await page.callMethod('blurComment'); await page.callMethod('closeSheet');
  await page.callMethod('react', { currentTarget: { dataset: { kind: 'like' } } }); await wait(async () => !await page.data('busy'));
  check('点赞以服务确认更新计数', (await page.data('engagement')).like.active && (await page.data('counts')).likes === 1);
  await page.callMethod('openGift'); await wait(async () => !!await page.data('wallet'));
  check('礼物有四个禁用文房用品', (await page.$$('.stationery-item')).length === 4);
  check('打开礼物不扣花', (await page.data('wallet')).balance === 3);
  await capture('gift'); await page.callMethod('sendFlower'); await wait(async () => !await page.data('busy'));
  check('确认赠礼仅扣一朵', (await page.data('wallet')).balance === 2 && (await page.data('counts')).flowers === 1);
  await page.callMethod('closeSheet');
  await open('/pages/author/index?id=qa-social-author', 'author');
  const identity = await box('.public-author-identity'), follow = await box('.follow-button');
  check('作者关注位于身份行右侧且长名字不挤出屏幕', follow.top >= identity.top && follow.top + follow.height <= identity.top + identity.height + 1 && follow.left > identity.left && follow.left + follow.width <= info.windowWidth);
  check('关注触控至少48px', follow.height >= 48 && follow.width >= 48); await capture('author');
  await page.callMethod('follow', { currentTarget: { dataset: {} } }); await wait(async () => !await page.data('busy'));
  check('回关显示互相关注', await page.data('followLabel') === '互相关注');
  await open('/pages/collections/index', 'accountReady'); await wait(async () => (await page.data('collections')).length === 1);
  const meta = await box('.social-article-meta'), cancel = await box('.social-article-meta .social-icon-button');
  check('取消收藏在元信息右侧并有独立热区', cancel.left > meta.left && cancel.height >= 48 && cancel.top >= meta.top);
  await capture('collections'); await page.callMethod('removeCollection', { currentTarget: { dataset: { id: 'qa-social-article' } } }); await wait(async () => !await page.data('busy'));
  check('取消收藏不打开文章', (await mini.currentPage()).path === 'pages/collections/index' && (await page.data('collections')).length === 0);
  const empty = await box('.social-empty'), button = await box('.social-empty .secondary-action');
  check('空态阅读按钮居中且保持内容宽度', Math.abs(button.left + button.width / 2 - empty.left - empty.width / 2) <= 1 && button.width < empty.width - 40); await capture('collections-empty');
  await open('/pages/relationships/index?tab=followers', 'accountReady'); await wait(async () => !await page.data('loading'));
  check('私有关系分栏显示真实夹具', (await page.data('authors')).length === 1); await capture('relationships');
  await open('/pages/flowers/index', 'accountReady'); await wait(async () => !!await page.data('wallet'));
  check('花页读取同一实际客户端余额', (await page.data('wallet')).balance === 2); await capture('flowers');
  await mini.evaluate(() => { getApp().__socialQa.fail = '/me/flowers'; }); await page.callMethod('refresh');
  check('库存失败有错误且不伪造零余额', !!await page.data('error') && !await page.data('wallet')); await capture('flowers-error');
  await mini.evaluate(() => { getApp().__socialQa.fail = ''; });
  await page.callMethod('refresh'); await wait(async () => !!await page.data('wallet'));
  await mini.evaluate(() => { const q = getApp().__socialQa; q.logged = false; q.generation++; q.listeners.forEach(fn => fn(q.s.account.snapshot())); });
  check('当前私有页账号失效立即隐藏库存并提供错误', !await page.data('wallet') && !!await page.data('error')); await capture('flowers-session-expired');
  await mini.evaluate(() => { const q = getApp().__socialQa; q.logged = true; q.generation++; });
  page = await mini.switchTab('/pages/profile/index'); await wait(async () => !!await page.data('accountReady')); await new Promise(r => setTimeout(r, 600));
  await capture('profile');
  check('个人中心保留真实原创作组件', !!await page.$('.author-articles'));
  await mini.evaluate(() => wx.pageScrollTo({ scrollTop: 550, duration: 0 })); await capture('profile-articles');
  await mini.evaluate(() => { getApp().__socialQa.fail = ''; getApp().__socialQa.unavailable = true; });
  await open('/pages/article/index?id=qa-social-article'); await wait(async () => !!await page.data('error'));
  check('下架清理正文图片与评论', !await page.data('article') && !await page.data('image') && !(await page.data('comments')).length); await capture('article-unavailable');
  check('无运行时异常', exceptions.length === 0);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ info, layoutEvidence, passed, exceptions, evidence: '真实开发者工具页面及文件；账号/网络/原生弹窗/键盘为替身，非真机' }, null, 2));
  console.log(JSON.stringify({ passed: passed.length, width: info.windowWidth, height: info.screenHeight, exceptions }));
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ passed, exceptions, error: String(error), stack: error.stack }, null, 2)); throw error;
} finally {
  if (installed) await mini.evaluate(() => {
    const q = getApp().__socialQa; if (!q) return;
    const s = q.s, v = q.saved;
    require('services.js').pauseMiniServices();
    for (const key of ['repository', 'writer', 'social', 'publicationStorage', 'publicImages', 'publications']) s[key] = v[key];
    for (const key of ['snapshot', 'subscribe', 'restore', 'refresh', 'login']) s.account[key] = v[key];
    s.sync.sync = v.sync; s.account.platform.request = v.platformRequest; s.account.platform.login = v.platformLogin;
    require('auth/navigation.js').clearLoginReturn(); delete getApp().__socialQa;
  }).catch(() => undefined);
  await mini.restoreWxMethod('showModal').catch(() => undefined); await mini.restoreWxMethod('showActionSheet').catch(() => undefined);
  if (installed) await mini.reLaunch('/pages/login/index').catch(() => undefined);
  await mini.disconnect();
}
