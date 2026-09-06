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
    replace(services.repository, new storage.MiniWorkRepository(services.files, wx.env.USER_DATA_PATH + '/qa-account-' + Date.now()));
    replace(services.writer, new storage.MiniDraftWriter(services.repository));
    replace(services.conversations, new (require('state/conversation-memory.js').ConversationMemory)((id, state) => services.writer.setWritingState(id, state)));
    const accountLogin = services.account.login;
    const platformLogin = services.account.platform.login, platformRequest = services.account.platform.request;
    const accountSnapshot = services.account.snapshot, accountRestore = services.account.restore, syncRun = services.sync.sync;
    const qa = { services, originals, accountLogin, platformLogin, platformRequest, accountSnapshot, accountRestore, syncRun, status: 'guest', failLogin: true, loginCalls: 0, syncCalls: 0 };
    services.account.snapshot = () => ({ ...accountSnapshot.call(services.account), status: qa.status, account: null, error: '' });
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
  await mini.reLaunch('/pages/login/index');
  await new Promise(resolve => setTimeout(resolve, 300));
  let loginPage = await mini.currentPage();
  const loginSize = await (await loginPage.$('.login-primary')).size();
  check('独立授权登录按钮铺满内容宽且至少56px', loginSize.width >= info.windowWidth - 52 && loginSize.height >= 56);
  await mini.screenshot({ path: resolve(output, 'login.png') });
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
  await mini.evaluate(() => { getApp().__accountQa.status = 'guest'; });
  await mini.switchTab('/pages/profile/index');
  await new Promise(resolve => setTimeout(resolve, 500));
  let page = await mini.currentPage();
  check('游客个人中心显示主动微信登录和本机备份', !!await page.$('.account-primary') && await page.data('exportLabel') === '导出本机备份');
  check('微信登录触控至少56px', (await (await page.$('.account-primary')).size()).height >= 56);
  await mini.screenshot({ path: resolve(output, 'profile-guest.png') });
  // Render documented account states without authenticating with WeChat or writing profile data.
  check('资料行完整占用可用宽度', (await (await page.$('.account-heading')).size()).width >= info.windowWidth - 52);
  check('作品工具共有三行且每行至少64px', (await page.$$('.tool-list .tool')).length === 4 && (await page.$$('.support-list .tool')).length === 1 && (await (await page.$('.tool')).size()).height >= 64);
  await page.setData({ account: { id: 'qa-account', nickname: '', hasAvatar: false, avatarVersion: 0 }, status: 'authenticated', needsLogin: false, canReconnect: false, accountText: '编辑头像与昵称', syncText: '作品已同步' });
  check('正常个人中心无重连与重复登录按钮', !await page.$('.sync-row button') && !await page.$('.account-primary') && !!await page.$('.logout-button'));
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
  check('资料抽屉提供原生头像与昵称输入', !!await page.$('.avatar-choose') && !!await page.$('.nickname-input'));
  const avatarSize = await (await page.$('.avatar-choose')).size();
  check('头像选择按钮铺满抽屉可用宽度：' + avatarSize.width + 'px', avatarSize.width >= info.windowWidth - 52);
  await page.callMethod('onNicknameReview', { detail: { pass: false } });
  check('昵称未通过保留抽屉并禁止保存', !await page.data('nicknameValid') && await page.data('editingProfile'));
  await mini.screenshot({ path: resolve(output, 'profile-edit.png') });
  await page.callMethod('closeProfile');
  await page.setData({ status: 'replaced', needsLogin: true, accountText: '已在其他设备登录', error: '已在其他设备登录，请主动微信登录。' });
  await mini.screenshot({ path: resolve(output, 'profile-replaced.png') });
  check('接管状态提供明确主动登录入口', (await (await page.$('.account-primary')).text()).includes('在此设备继续'));
  await mini.reLaunch('/pages/editor/index?xiaowen=compose');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  await page.callMethod('onBodyInput', { detail: { value: '这篇正文已经保存在本机。' } });
  await page.callMethod('flushAutoSave');
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
  // currentPage changes before the native route animation accepts another navigation.
  await loginPage.waitFor(1000);
  await (await loginPage.$('.login-skip')).tap();
  await new Promise(resolve => setTimeout(resolve, 400));
  await waitFor(async () => (await mini.currentPage()).path === 'pages/editor/index', '取消登录返回作品');
  page = await mini.currentPage();
  check('取消登录回到原作品并保留未发送输入', page.path === 'pages/editor/index' && await page.data('xiaowenComposer') === '只在输入框里，还没发送给小文。');
  await page.callMethod('closeXiaoWen');
  await page.setData({ readOnly: true, canReconnect: true, cloudVersion: 1, syncLabel: '未上传', cloudMessage: '网络不可用，当前输入已保存在本机。' });
  const body = await page.data('body');
  await page.callMethod('onBodyInput', { detail: { value: '不应被允许的新输入' } });
  check('暂停状态的原生输入与事件入口都不能改正文', await page.data('body') === body && !!await page.$('.cloud-message'));
  await mini.screenshot({ path: resolve(output, 'editor-paused.png') });
  console.info(JSON.stringify({ width: info.windowWidth, height: info.windowHeight, passed: passed.length, paidCalls: 0, realWeChatLogin: false }));
  await writeFile(resolve(output, 'account-ui-result.json'), JSON.stringify({ window: { width: info.windowWidth, height: info.windowHeight }, passed, realWeChatLogin: false, paidCalls: 0 }, null, 2));
} finally {
  if (installed) {
    await mini.reLaunch('/pages/home/index');
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
  }
  await mini.disconnect();
}
