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
let installed = false;
try {
  assert.equal((await mini.currentPage()).path, 'pages/home/index', '先回首页，避免打断用户编辑');
  await mini.evaluate(() => {
    const serviceModule = require('services.js'); serviceModule.pauseMiniServices();
    const services = serviceModule.miniServices();
    if (services.account.snapshot().account) throw new Error('请使用游客状态做独立视觉夹具，不覆盖真实账号');
    const storage = require('storage/repository.js');
    const originals = [];
    const replace = (target, next) => { originals.push({ target, state: { ...target } }); for (const key of Object.keys(target)) delete target[key]; Object.assign(target, next); };
    replace(services.repository, new storage.MiniWorkRepository(services.files, wx.env.USER_DATA_PATH + '/qa-account-' + Date.now()));
    replace(services.writer, new storage.MiniDraftWriter(services.repository));
    replace(services.conversations, new (require('state/conversation-memory.js').ConversationMemory)((id, state) => services.writer.setWritingState(id, state)));
    getApp().__accountQa = { services, originals };
  });
  installed = true;
  const info = await mini.systemInfo();
  await mini.switchTab('/pages/profile/index');
  await new Promise(resolve => setTimeout(resolve, 500));
  let page = await mini.currentPage();
  check('游客个人中心显示主动微信登录和本机备份', !!await page.$('.account-primary') && await page.data('exportLabel') === '导出本机备份');
  check('微信登录触控至少56px', (await (await page.$('.account-primary')).size()).height >= 56);
  await mini.screenshot({ path: resolve(output, 'profile-guest.png') });
  // Render documented account states without authenticating with WeChat or writing profile data.
  await page.setData({ account: { id: 'qa-account', nickname: '', hasAvatar: false, avatarVersion: 0 }, status: 'authenticated', accountText: '微信已登录', syncText: '云作品已同步' });
  await page.callMethod('openProfile');
  check('资料抽屉提供原生头像与昵称输入', !!await page.$('.avatar-choose') && !!await page.$('.nickname-input'));
  const avatarSize = await (await page.$('.avatar-choose')).size();
  check('头像选择按钮铺满抽屉可用宽度：' + avatarSize.width + 'px', avatarSize.width >= info.windowWidth - 52);
  await page.callMethod('onNicknameReview', { detail: { pass: false } });
  check('昵称未通过保留抽屉并禁止保存', !await page.data('nicknameValid') && await page.data('editingProfile'));
  await mini.screenshot({ path: resolve(output, 'profile-edit.png') });
  await page.callMethod('closeProfile');
  await page.setData({ status: 'replaced', accountText: '已在其他设备登录', error: '已在其他设备登录，请主动微信登录。' });
  await mini.screenshot({ path: resolve(output, 'profile-replaced.png') });
  check('接管状态提供明确主动登录入口', (await (await page.$('.account-primary')).text()).includes('在此设备继续'));
  await mini.reLaunch('/pages/editor/index?xiaowen=compose');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  await page.callMethod('onXiaoWenInput', { detail: { value: '只在输入框里，还没发送给小文。' } });
  await page.callMethod('flushAutoSave');
  const id = (await page.data('draft')).id;
  await mini.reLaunch('/pages/editor/index?id=' + encodeURIComponent(id) + '&xiaowen=compose');
  await new Promise(resolve => setTimeout(resolve, 500));
  page = await mini.currentPage();
  check('空正文作品重开恢复未发送输入', await page.data('xiaowenComposer') === '只在输入框里，还没发送给小文。');
  await page.callMethod('closeXiaoWen');
  await page.setData({ readOnly: true, cloudVersion: 1, syncLabel: '未上传', cloudMessage: '网络不可用，当前输入已保存在本机。' });
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
      delete getApp().__accountQa;
    });
  }
  await mini.disconnect();
}
