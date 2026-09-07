// Explicit visual/interaction fixtures. Real account/cloud protocol runs in the HTTP/SQLite tests.
/* eslint-disable @typescript-eslint/no-require-imports -- DevTools evaluate uses CommonJS. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.MINI_AUTOMATOR_PATH || !process.env.MINI_QA_OUTPUT) throw new Error('请指定独立 automator 包和截图目录');
const mini = await createRequire(import.meta.url)(process.env.MINI_AUTOMATOR_PATH).connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
const output = resolve(process.env.MINI_QA_OUTPUT);
await mkdir(output, { recursive: true });
const passed = [];
const check = (label, actual) => { assert.ok(actual, label); passed.push(label); console.info('PASS ' + label); };
async function waitFor(check, label) {
  for (let i = 0; i < 60; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('等待界面状态失败：' + label);
}
let installed = false;
try {
  assert.ok(['pages/home/index', 'pages/login/index'].includes((await mini.currentPage()).path), '先回首页或登录页，避免打断用户编辑');
  await mini.evaluate(() => {
    const serviceModule = require('services.js'); serviceModule.pauseMiniServices();
    require('auth/navigation.js').clearLoginReturn();
    const services = serviceModule.miniServices();
    if (services.account.snapshot().account) throw new Error('请使用游客状态做独立视觉夹具，不覆盖真实账号');
    const storage = require('storage/repository.js');
    const originals = [];
    const replace = (target, next) => { originals.push({ target, state: { ...target } }); for (const key of Object.keys(target)) delete target[key]; Object.assign(target, next); };
    replace(services.repository, new storage.MiniWorkRepository(services.files, wx.env.USER_DATA_PATH + '/qa-account-' + Date.now(), undefined, 'qa-account'));
    replace(services.writer, new storage.MiniDraftWriter(services.repository));
    replace(services.conversations, new (require('state/conversation-memory.js').ConversationMemory)((id, state) => services.writer.setWritingState(id, state)));
    const accountLogin = services.account.login;
    const platformLogin = services.account.platform.login, platformRequest = services.account.platform.request;
    const accountSnapshot = services.account.snapshot, accountRestore = services.account.restore, syncRun = services.sync.sync;
    const qa = { services, originals, accountLogin, platformLogin, platformRequest, accountSnapshot, accountRestore, syncRun, status: 'guest', failLogin: true, loginCalls: 0, syncCalls: 0 };
    services.account.snapshot = () => ({ ...accountSnapshot.call(services.account), status: qa.status, account: qa.status === 'guest' ? null : { id: 'qa-account', nickname: '', hasAvatar: false, avatarVersion: 0 }, error: '' });
    services.account.restore = async () => {};
    services.sync.sync = async () => { qa.syncCalls++; if (qa.failSync) throw new Error('同步暂未完成，请重试'); };
    services.account.platform.login = async () => { throw new Error("视觉回归禁止真实微信换码"); };
    services.account.platform.request = async () => { throw new Error("视觉回归禁止账号网络请求"); };
    services.account.login = async () => { qa.loginCalls++; if (qa.failLogin) throw new Error('微信登录未成功，请重试。'); qa.status = 'authenticated'; };
    getApp().__accountQa = qa;
  });
  installed = true;
  const info = await mini.systemInfo();
  console.info(JSON.stringify({ width: info.windowWidth, height: info.windowHeight }));
  if (process.env.MINI_QA_EXPECTED_WIDTH) assert.equal(info.windowWidth, Number(process.env.MINI_QA_EXPECTED_WIDTH), '必须连接正确尺寸的模拟器');
  let loginPage, page;
  if (process.env.MINI_QA_EDITOR_ONLY === '1') {
    await mini.evaluate(() => { const qa = getApp().__accountQa; qa.status = 'authenticated'; qa.failLogin = false; });
  } else {
    for (const route of ['home', 'works', 'profile', 'editor', 'interview', 'topic-detail', 'source']) {
      await mini.reLaunch('/pages/' + route + '/index');
      await waitFor(async () => (await mini.currentPage()).path === 'pages/login/index', '未登录拦截' + route);
      await (await mini.currentPage()).waitFor(1000);
      check('未登录直接打开 ' + route + ' 被拦截且清空返回栈', await mini.evaluate(() => getCurrentPages().length === 1));
    }
    await mini.evaluate(() => require('auth/navigation.js').clearLoginReturn());
    await mini.reLaunch('/pages/login/index');
    await new Promise(resolve => setTimeout(resolve, 300));
    loginPage = await mini.currentPage();
    const loginSize = await (await loginPage.$('.login-primary')).size();
    check('独立授权登录按钮铺满内容宽且至少56px', loginSize.width >= info.windowWidth - 52 && loginSize.height >= 56);
    check('登录按钮下只有隐私入口，没有跳过和上下说明', !await loginPage.$('.login-skip') && !await loginPage.$('.login-saving') && (await (await loginPage.$('.login-terms')).text()).trim() === '隐私说明 ›');
    await mini.screenshot({ path: resolve(output, 'login.png') });
    await loginPage.callMethod('openPrivacy');
    await waitFor(async () => (await mini.currentPage()).path === 'pages/privacy/index', '未登录阅读隐私');
    check('未登录仍可阅读隐私说明', !!await (await mini.currentPage()).$('.privacy-section'));
    await (await mini.currentPage()).waitFor(1000);
    await mini.navigateBack();
    await waitFor(async () => (await mini.currentPage()).path === 'pages/login/index', '隐私返回登录');
    loginPage = await mini.currentPage();
    await loginPage.waitFor(1000);
    await loginPage.callMethod('login');
    await new Promise(resolve => setTimeout(resolve, 400));
    await waitFor(async () => !await loginPage.data('busy'), '登录失败反馈');
    check('登录失败留在原页并显示明确重试', (await mini.currentPage()).path === 'pages/login/index' && (await loginPage.data('error')).includes('未成功'));
    await mini.screenshot({ path: resolve(output, 'login-failed.png') });
    await mini.evaluate(() => { getApp().__accountQa.failLogin = false; });
    await loginPage.callMethod('login');
    await new Promise(resolve => setTimeout(resolve, 300));
    await waitFor(async () => (await mini.currentPage()).path === 'pages/home/index', '登录成功返回首页');
    check('点击授权登录后回到首页', (await mini.currentPage()).path === 'pages/home/index');
    await mini.switchTab('/pages/profile/index');
    await new Promise(resolve => setTimeout(resolve, 500));
    page = await mini.currentPage();
    await page.callMethod('refreshState');
    check('空账号不显示未上传或无缘由重试', await page.data('syncText') === '还没有作品' && !await page.data('canReconnect'));
    // Render documented account states without authenticating with WeChat or writing profile data.
    check('资料行完整占用可用宽度', (await (await page.$('.account-heading')).size()).width >= info.windowWidth - 52);
    check('作品工具共有三行且每行至少64px', (await page.$$('.tool-list .tool')).length === 4 && (await page.$$('.support-list .tool')).length === 1 && (await (await page.$('.tool')).size()).height >= 64);
    await page.setData({ account: { id: 'qa-account', nickname: '', hasAvatar: false, avatarVersion: 0 }, status: 'authenticated', needsLogin: false, canReconnect: false, accountText: '编辑头像与用户名', syncText: '还没有作品' });
    check('正常个人中心无常驻同步状态与重复登录按钮', !await page.$('.sync-row') && !await page.$('.account-primary') && !!await page.$('.logout-button'));
    await mini.screenshot({ path: resolve(output, 'profile-signed-in.png') });
    await page.callMethod('logout');
    check('退出提供明确确认和取消入口', await page.data('logoutOpen') && !!await page.$('.logout-actions'));
    await mini.screenshot({ path: resolve(output, 'logout-confirm.png') });
    await page.callMethod('closeLogout');
    check('取消退出保留资料', !!await page.data('account'));
    await page.callMethod('openMenu');
    await mini.screenshot({ path: resolve(output, 'backup.png') });
    await page.callMethod('closeMenu');
    await page.callMethod('openProfile');
    check('资料抽屉提供原生头像与用户名组件', !!await page.$('.avatar-choose') && !!await (await page.$('.publication-username')).$('.username-input'));
    const avatarSize = await (await page.$('.avatar-choose')).size();
    check('头像选择按钮铺满抽屉可用宽度：' + avatarSize.width + 'px', avatarSize.width >= info.windowWidth - 52);
    await (await page.$('.publication-username')).callMethod('reviewName', { detail: { pass: false } });
    check('昵称未通过保留抽屉并禁止保存', !await (await page.$('.publication-username')).data('valid') && await page.data('editingProfile'));
    await mini.screenshot({ path: resolve(output, 'profile-edit.png') });
    await page.callMethod('closeProfile');
    await page.setData({ status: 'replaced', needsLogin: true, accountText: '已在其他设备登录', error: '已在其他设备登录，请主动微信登录。' });
    await mini.screenshot({ path: resolve(output, 'profile-replaced.png') });
    check('接管状态提供明确主动登录入口', (await (await page.$('.account-primary')).text()).includes('在此设备继续'));
  }
  await mini.reLaunch('/pages/works/index');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  await waitFor(async () => !await page.data('loading'), '空作品列表');
  check('作品空态无过期游客与自动上传说明', !(await (await page.$('.empty-state')).text()).includes('未登录'));
  await mini.screenshot({ path: resolve(output, 'works-empty.png') });
  await mini.reLaunch('/pages/editor/index?xiaowen=compose');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  await waitFor(async () => await page.data('accountReady') && !!await page.data('draft') && !await page.data('readOnly'), '作品可编辑');
  await page.callMethod('closeXiaoWen');
  check('空白新稿不显示保存上传标签', !await page.data('syncLabel') && !await page.$('.cloud-save-row'));
  await mini.screenshot({ path: resolve(output, 'editor-empty.png') });
  const emptyId = (await page.data('draft')).id;
  for (const mode of ['voice', 'text']) {
    if (mode === 'text') await page.callMethod('focusText');
    await mini.navigateTo('/pages/privacy/index');
    await (await mini.currentPage()).waitFor(1000);
    await mini.navigateBack();
    await waitFor(async () => (await mini.currentPage()).path === 'pages/editor/index', '空白稿返回');
    page = await mini.currentPage();
    await page.waitFor(1000);
    check(mode + ' 空白稿跨页返回保留标识和输入方式，没有读取或保存错误', (await page.data('draft')).id === emptyId
      && (await page.data('draft')).inputMode === mode && !await page.data('error') && !await page.data('loadError') && !await page.data('readOnly'));
    check(mode + ' 空白稿没有生成空作品，也没有同步或错误提示', !await page.data('saved') && !await page.$('.editor-error') && !await page.$('.cloud-save-row')
      && await mini.evaluate(async id => !await getApp().__accountQa.services.repository.getAggregate(id), emptyId));
  }
  await mini.screenshot({ path: resolve(output, 'editor-empty-resumed.png') });
  await page.callMethod('focusText');
  await page.callMethod('onBodyInput', { detail: { value: '这篇正文已经保存在本机。' } });
  await page.callMethod('flushAutoSave');
  check('正文先落盘再输入小文草稿', await page.data('body') === '这篇正文已经保存在本机。' && await page.data('saved'));
  await page.callMethod('refreshCloudState');
  check('正常写作不常驻同步上传提示', await page.data('syncLabel') === '已保存到本机' && !await page.$('.cloud-save-row'));
  await mini.evaluate(() => {
    const qa = getApp().__accountQa;
    const write = qa.services.writer.write;
    qa.services.writer.write = async function () {
      qa.services.writer.write = write;
      throw new Error("unlinkSync:fail no such file or directory, unlink 'wxfile://usr/qa/index.json.bak'");
    };
  });
  await page.callMethod('saveNow');
  check('底层保存异常不展示路径并保留正文', !/unlink|wxfile|\.bak/.test(await page.data('error')) && !!await page.data('error') && await page.data('body') === '这篇正文已经保存在本机。');
  check('保存失败不叠加云提示，两个补救按钮同排且可触达', !await page.$('.cloud-save-row') && !await page.$('.cloud-message') && (await page.$$('.error-actions button')).length === 2
    && (await (await page.$('.error-actions')).size()).height <= 56 && (await (await page.$('.error-actions button')).size()).height >= 48);
  await mini.screenshot({ path: resolve(output, 'editor-save-error.png') });
  await page.callMethod('retryError');
  check('重试保存成功后收起错误并保留正文', await page.data('saved') && !await page.data('error'));
  await page.callMethod('onXiaoWenInput', { detail: { value: '只在输入框里，还没发送给小文。' } });
  await page.callMethod('flushAutoSave');
  const id = (await page.data('draft')).id;
  await mini.reLaunch('/pages/editor/index?id=' + encodeURIComponent(id) + '&xiaowen=compose');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  check('已保存正文作品重开恢复未发送输入', await page.data('xiaowenComposer') === '只在输入框里，还没发送给小文。');
  await page.callMethod('goToAccount');
  await new Promise(resolve => setTimeout(resolve, 200));
  await waitFor(async () => (await mini.currentPage()).path === 'pages/login/index', '从作品打开登录页');
  check('从作品直接到登录页，不绕个人中心', (await mini.currentPage()).path === 'pages/login/index');
  loginPage = await mini.currentPage();
  await loginPage.waitFor(1000);
  await loginPage.callMethod('login');
  await waitFor(async () => (await mini.currentPage()).path === 'pages/editor/index', '登录后恢复原作品');
  page = await mini.currentPage();
  await waitFor(async () => await page.data('accountReady') && await page.data('xiaowenComposer') === '只在输入框里，还没发送给小文。', '原输入恢复');
  check('登录后回到原作品并保留未发送输入', await page.data('body') === '这篇正文已经保存在本机。');
  await page.callMethod('closeXiaoWen');
  await page.setData({ readOnly: true, canReconnect: true, cloudVersion: 1, syncLabel: '已保存到本机', cloudMessage: '网络已断开，编辑已暂停。请联网后重试。' });
  const body = await page.data('body');
  await page.callMethod('onBodyInput', { detail: { value: '不应被允许的新输入' } });
  check('暂停状态的原生输入与事件入口都不能改正文', await page.data('body') === body && !!await page.$('.cloud-message'));
  await mini.screenshot({ path: resolve(output, 'editor-paused.png') });
  const concurrency = await mini.evaluate(async () => {
    const { MiniWorkRepository } = require('storage/repository.js');
    const { emptyDraft } = require('domain/core.js');
    const qa = getApp().__accountQa;
    const root = wx.env.USER_DATA_PATH + '/qa-save-race-' + Date.now();
    const repository = new MiniWorkRepository(qa.services.files, root, undefined, 'qa-author');
    const draft = { ...emptyDraft(), inputMode: 'text', textDraft: '并发回归原文' };
    await repository.save(draft, 0);
    const results = await Promise.allSettled([repository.load(), repository.load(), repository.save({ ...draft, textDraft: '并发回归新文字' }, 1), repository.load()]);
    const restarted = await new MiniWorkRepository(qa.services.files, root, undefined, 'qa-author').load();
    return { successful: results.every(result => result.status === 'fulfilled'), restored: restarted.works[0]?.draft.textDraft === '并发回归新文字', issues: restarted.issues.length };
  });
  check('实际微信文件 API 并发保存与读取通过，重建仓储保留最新内容', concurrency.successful && concurrency.restored && concurrency.issues === 0);
  await mini.reLaunch('/pages/editor/index?id=qa-missing-article');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  await waitFor(async () => !!await page.data('loadError'), '不存在文章的读取错误');
  check('读取失败提供重新打开和返回文章，不显示保存操作或账号归属断言', (await (await page.$('.error-actions')).text()).includes('重新打开')
    && (await (await page.$('.error-actions')).text()).includes('返回文章') && !(await page.data('loadError')).includes('不属于')
    && !await page.data('draft') && await page.data('readOnly'));
  check('读取补救按钮同排且可触达', (await (await page.$('.error-actions')).size()).height <= 56 && (await (await page.$('.error-actions button')).size()).height >= 48);
  await mini.screenshot({ path: resolve(output, 'editor-load-error.png') });
  await page.callMethod('retryError');
  check('重新打开不会把不存在的文章创建为空稿', !!await page.data('loadError') && !await page.data('draft')
    && await mini.evaluate(async () => !await getApp().__accountQa.services.repository.getAggregate('qa-missing-article')));
  await mini.evaluate(async () => {
    const qa = getApp().__accountQa;
    const { emptyDraft } = require('domain/core.js');
    await qa.services.repository.save({ ...emptyDraft(), id: 'qa-missing-article', inputMode: 'text', textDraft: '重新读取成功后的原文章。' }, 0);
  });
  await page.callMethod('retryError');
  check('读取恢复后重新打开同一目标，清除提示并恢复编辑', await page.data('body') === '重新读取成功后的原文章。'
    && !await page.data('loadError') && !await page.data('error') && !await page.data('readOnly'));
  await mini.screenshot({ path: resolve(output, 'editor-load-recovered.png') });
  console.info(JSON.stringify({ width: info.windowWidth, height: info.windowHeight, passed: passed.length, paidCalls: 0, realWeChatLogin: false }));
  await writeFile(resolve(output, 'account-ui-result.json'), JSON.stringify({ window: { width: info.windowWidth, height: info.windowHeight }, passed, realWeChatLogin: false, paidCalls: 0 }, null, 2));
} finally {
  if (installed) {
    await mini.reLaunch('/pages/login/index');
    await mini.evaluate(async () => {
      const qa = getApp().__accountQa; if (!qa) return;
      await qa.services.writer.flush();
      for (const { target, state } of qa.originals.reverse()) { for (const key of Object.keys(target)) delete target[key]; Object.assign(target, state); }
      qa.services.account.login = qa.accountLogin;
      qa.services.account.platform.login = qa.platformLogin;
      qa.services.account.platform.request = qa.platformRequest;
      qa.services.account.snapshot = qa.accountSnapshot;
      qa.services.account.restore = qa.accountRestore;
      qa.services.sync.sync = qa.syncRun;
      require('auth/navigation.js').clearLoginReturn();
      delete getApp().__accountQa;
    });
    await mini.reLaunch('/pages/login/index');
  }
  await mini.disconnect();
}
