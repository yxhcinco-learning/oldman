// Explicit local DevTools regression. No production AI requests or user storage writes.
// MINI_AUTOMATOR_PATH points to an independently installed miniprogram-automator package.
/* eslint-disable @typescript-eslint/no-require-imports -- DevTools evaluate executes CommonJS in the app service. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

if (!process.env.MINI_AUTOMATOR_PATH || !process.env.MINI_QA_OUTPUT) {
  throw new Error('请设置 MINI_AUTOMATOR_PATH 与 MINI_QA_OUTPUT；仅连接已开启自动化的本机开发者工具');
}
const automator = createRequire(import.meta.url)(process.env.MINI_AUTOMATOR_PATH);
const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
const output = resolve(process.env.MINI_QA_OUTPUT);
await mkdir(output, { recursive: true });
const passed = [];
let page;
let installed = false;
const check = (name, value) => { assert.ok(value, name); passed.push(name); console.info(`PASS ${name}`); };
const result = (intent, answer, extra = {}) => ({ answer, dialogue: { intent }, citedVersionIds: [], ...extra });
const enqueue = item => mini.evaluate(value => getApp().__dialogueQa.queue.push(value), item);
async function current(path) {
  for (let i = 0; i < 60; i++) {
    page = await mini.currentPage();
    if (page?.path === `pages/${path}/index` && await page.data('draft') && !await page.data('operationBusy') && !await page.data('saving')) return page;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`页面未就绪：${path} ${JSON.stringify({ path: page?.path, busy: await page.data('operationBusy'), saving: await page.data('saving'), error: await page.data('xiaowenError'), requests: await requestCount() })}`);
}
async function send(text, response, target) {
  const interview = page.path.includes('/interview/');
  await enqueue(response);
  const input = await page.$(interview ? '.composer-row textarea' : '.xiaowen-composer textarea');
  assert.ok(input, '输入组件存在');
  await input.input(text);
  await (await page.$(interview ? '.send' : '.xiaowen-send')).tap();
  await new Promise(resolve => setTimeout(resolve, 300));
  await current(target ?? (interview ? 'interview' : 'editor'));
}
const conversation = () => page.data('session.conversation');
const requestCount = () => mini.evaluate(() => getApp().__dialogueQa.requests.length);
try {
  assert.equal((await mini.currentPage()).path, 'pages/home/index', '先回首页，避免打断正在编辑的作品');
  await mini.evaluate(() => {
    const serviceModule = require('services.js');
    const original = serviceModule.miniServices;
    const services = original();
    const storage = require('storage/repository.js');
    const core = require('domain/core.js');
    if (typeof core.conversationView !== 'function') throw new Error('运行包缺少 conversationView');
    const root = wx.env.USER_DATA_PATH + '/qa-dialogue-' + Date.now();
    const originals = [];
    const replace = (target, source) => {
      originals.push({ target, state: { ...target } });
      for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
      Object.assign(target, source); return target;
    };
    const repository = replace(services.repository, new storage.MiniWorkRepository(services.files, root));
    const writer = replace(services.writer, new storage.MiniDraftWriter(repository));
    const qa = { original, originals, root, queue: [], requests: [], pending: [], consent: services.aiConsent.ensure };
    const transport = { request(request) {
      qa.requests.push(request);
      const item = qa.queue.shift();
      return { response: new Promise((resolve, reject) => {
        const finish = () => item?.error ? reject(new Error(item.error)) : resolve({ requestId: request.requestId, result: item?.result });
        if (item?.defer) qa.pending.push(finish); else finish();
      }), cancel() {} };
    } };
    replace(services.articleAi, new (require('ai/controller.js').MiniArticleAiController)(repository, writer, transport));
    replace(services.conversations, new (require('state/conversation-memory.js').ConversationMemory)());
    services.aiConsent.ensure = async () => true;
    qa.services = services;
    getApp().__dialogueQa = qa;
  });
  installed = true;
  await mini.reLaunch('/pages/editor/index?xiaowen=compose');
  await current('editor');
  check('空编辑器加载，无 conversationView 异常', await page.data('error') === '');
  await send('你好', { result: result('reply', '您好！您想聊什么？') });
  check('问候消息与回复连续、无素材、正文仍空', (await conversation()).messages.length === 2 && (await conversation()).materials.length === 0 && await page.data('body') === '');
  await (await page.$('.ai-mode-bar button')).tap();
  await current('interview');
  check('按钮开启访谈，静态开场不请求模型', (await conversation()).mode === 'interview' && await requestCount() === 1);
  // Native keyboard properties are not exposed by automator.property; WXML's
  // boolean bindings are checked in project-config.test.ts, not guessed here.
  const footer = await page.$('.interview-footer');
  const restingTop = (await footer.offset()).top;
  await page.callMethod('onKeyboardHeight', { detail: { height: 300 } });
  await new Promise(resolve => setTimeout(resolve, 200));
  const keyboardTop = (await footer.offset()).top;
  check('模拟键盘仅补偿一次高度，输入未跳到顶部', Math.abs(restingTop - keyboardTop - 300) <= 3 && keyboardTop > 100);
  await mini.screenshot({ path: resolve(output, 'keyboard-inset.png') });
  await page.callMethod('onKeyboardHeight', { detail: { height: 0 } });
  await new Promise(resolve => setTimeout(resolve, 200));
  check('键盘收起恢复输入位置', Math.abs((await footer.offset()).top - restingTop) <= 3);
  await send('你好', { result: result('reply', '您好，我们慢慢聊。您想先聊哪段经历？') });
  check('访谈问候不作为素材', (await conversation()).materials.length === 0);
  await send('没听懂，你为什么这样问？', { result: result('reply', '我是想了解您的经历。您愿意从工作聊起吗？') });
  check('解释和反问不退出访谈', (await conversation()).mode === 'interview');
  await send('这个问题先不聊', { result: result('reply', '可以换个角度，您最近有什么感受？') });
  check('含糊意图只换角度，不结束', (await conversation()).mode === 'interview');
  await send('我在工厂工作了二十年。', { result: result('reply', '二十年的经历很丰富，哪一次判断让您印象深刻？', { dialogue: { intent: 'reply', material: { text: '我在工厂工作了二十年。' } } }) });
  const material = (await conversation()).materials[0];
  check('真实回答关联原始消息', !!material?.sourceMessageId);
  await send('更正一下，是三十年。', { result: result('reply', '记下了，是三十年。那次经历发生在什么时候？', { dialogue: { intent: 'reply', material: { text: '更正一下，是三十年。', supersedes: material.id } } }) });
  check('素材更正保留来源关系', (await conversation()).materials[1]?.supersedes === material.id);
  await (await page.$('.composer-row textarea')).input('尚未发送的草稿');
  const beforeClose = await requestCount();
  const id = await page.data('draft.id');
  await (await page.$('.interview-back')).tap();
  await current('editor');
  await (await page.$('.xiaowen')).tap();
  await current('interview');
  check('收起重开保留访谈、输入、历史，不请求模型', (await conversation()).mode === 'interview' && await page.data('composer') === '尚未发送的草稿' && await requestCount() === beforeClose);
  await mini.reLaunch(`/pages/interview/index?id=${id}`);
  await current('interview');
  check('页面重载保留模式与历史', (await conversation()).materials.length === 2 && await requestCount() === beforeClose);
  await mini.screenshot({ path: resolve(output, 'interview.png') });
  await send('把刚才聊的整理出来', { result: result('finish', '已整理，您可以决定是否采用。', { body: '我在工厂工作了三十年。' }) }, 'editor');
  check('自然语言结束后普通对话，候选不直接改正文', (await conversation()).mode === 'conversation' && await page.data('body') === '');
  let turn = (await page.data('session.turns')).at(-1);
  await page.callMethod('openCandidate', turn.id);
  check('结束候选标明整理，不误标优化', await page.data('candidateEditLabel') === '整理');
  check('预览删除重复说明并使用清楚的文章操作', await page.data('candidateTitle') === '整理后的文章' && !await page.$('.candidate-summary') && !await page.$('.xiaowen-brand') && await (await page.$('.candidate-apply')).text() === '用这篇');
  await mini.screenshot({ path: resolve(output, 'candidate.png') });
  await (await page.$('.candidate-apply')).tap();
  await current('editor');
  check('明确采用才写入正文', await page.data('body') === '我在工厂工作了三十年。');
  await page.callMethod('undoTurn', { currentTarget: { dataset: { id: turn.id } } });
  await current('editor');
  check('撤销恢复原文且保留版本', await page.data('body') === '');
  await send('你来问我吧', { result: result('start', '我们接着聊，那次判断发生了什么？') }, 'interview');
  check('自然语言开启沿用历史', (await conversation()).materials.length === 2);
  await send('聊得差不多了', { error: '模拟自然结束失败' });
  check('自然语言结束失败不猜测模式切换', (await conversation()).mode === 'interview');
  await mini.evaluate(() => {
    const writer = getApp().__dialogueQa.services.writer; const original = writer.updateLatestSession;
    writer.updateLatestSession = function () { writer.updateLatestSession = original; throw new Error('模拟结果保存失败'); };
  });
  await send('聊得差不多了', { result: result('finish', '已整理。', { body: '尚未成功保存的候选。' }) });
  check('结果保存失败不切换自然语言模式，原始消息仍可重试', (await conversation()).mode === 'interview' && (await page.data('session.turns')).at(-1).status === 'failed');
  await send('把现有正文改得简短一点', { result: result('confirm-edit', '需要先结束访谈再修改，是否继续？') });
  check('访谈改文先保留原要求并确认', await page.data('pendingEdit') === '把现有正文改得简短一点' && (await conversation()).mode === 'interview');
  await page.callMethod('continueInterview');
  check('取消改文确认继续访谈', !await page.data('pendingEdit') && (await conversation()).mode === 'interview');
  await send('把现有正文改得简短一点', { result: result('confirm-edit', '需要先结束访谈再修改，是否继续？') });
  const beforeConfirm = await requestCount();
  await enqueue({ result: result('finish', '已合并整理与修改。', { body: '三十年工厂经历。' }) });
  await page.callMethod('confirmEdit');
  await current('editor');
  check('确认结束保留原改文要求，一次请求生成候选', await requestCount() === beforeConfirm + 1 && await mini.evaluate(() => getApp().__dialogueQa.requests.at(-1).prompt) === '把现有正文改得简短一点' && (await conversation()).mode === 'conversation');
  await page.callMethod('startInterview');
  await current('interview');
  await enqueue({ error: '模拟断网' });
  await (await page.$('.ai-mode-bar button')).tap();
  await current('editor');
  turn = (await page.data('session.turns')).at(-1);
  check('按钮结束整理失败仍是普通模式且可重试', (await conversation()).mode === 'conversation' && turn.status === 'failed');
  const messageCount = (await conversation()).messages.length;
  await enqueue({ result: result('finish', '内容还不足以形成完整文章，请补充具体经历。') });
  await page.callMethod('retryTurn', { currentTarget: { dataset: { id: turn.id } } });
  await current('editor');
  check('重试不重复用户消息和切换记录；不足不成文', (await conversation()).messages.length === messageCount + 1 && (await page.data('session.turns')).at(-1).status === 'answered' && await page.data('body') === '');
  await send('帮我改写成短文', { result: result('edit', '候选已备好。', { body: '候选正文。' }) });
  turn = (await page.data('session.turns')).at(-1);
  await page.callMethod('openCandidate', turn.id);
  await page.callMethod('dismissCandidate');
  check('放弃候选不改变正文或模式', await page.data('body') === '' && (await conversation()).mode === 'conversation');
  await send('再帮我改写', { result: result('edit', '候选已备好。', { body: '另一份候选。' }) });
  turn = (await page.data('session.turns')).at(-1);
  await page.callMethod('onBodyInput', { detail: { value: '用户后来修改的正文。' } });
  await page.callMethod('saveNow');
  await page.callMethod('openCandidate', turn.id);
  check('正文变更后候选标记版本冲突', await page.data('candidateStale') === true);
  await page.callMethod('applyCandidate');
  check('冲突拒绝应用且不覆盖新正文', await page.data('body') === '用户后来修改的正文。' && (await page.data('xiaowenError')).includes('正文已发生变化'));
  await page.callMethod('backToConversation');
  const beforeConsent = await requestCount();
  await mini.evaluate(() => { getApp().__dialogueQa.services.aiConsent.ensure = async () => false; });
  await page.callMethod('onXiaoWenInput', { detail: { value: '不同意发送的输入' } });
  await page.callMethod('sendXiaoWen');
  await current('editor');
  check('拒绝发送确认保留输入，不请求模型', await requestCount() === beforeConsent && await page.data('xiaowenComposer') === '不同意发送的输入');
  await mini.evaluate(() => { getApp().__dialogueQa.services.aiConsent.ensure = async () => true; });
  const beforeFail = await requestCount();
  await mini.evaluate(() => { const q = getApp().__dialogueQa; q.write = q.services.writer.write; q.services.writer.write = async () => { throw new Error('模拟保存失败'); }; });
  await page.callMethod('startInterview');
  check('保存失败不切换模式、不发请求', (await conversation()).mode === 'conversation' && await requestCount() === beforeFail);
  await mini.evaluate(() => { const q = getApp().__dialogueQa; q.services.writer.write = q.write; });
  // Fault injection into the real page catches render failures after data has loaded.
  check('展示失败保留已加载作品和正文', await mini.evaluate(async () => {
    const p = getCurrentPages().at(-1); const previous = p.syncXiaoWen; const id = p.data.draft.id;
    p.syncXiaoWen = () => { throw new Error('模拟共享函数异常'); };
    try { await p.open(id); return p.data.draft.id === id && p.data.body === '用户后来修改的正文。' && p.data.error === '模拟共享函数异常'; }
    finally { p.syncXiaoWen = previous; }
  }));
  await page.callMethod('open', id, true);
  await enqueue({ defer: true, result: result('edit', '迟到候选', { body: '不应应用的迟到正文' }) });
  await page.callMethod('onXiaoWenInput', { detail: { value: '慢请求测试' } });
  await page.callMethod('sendXiaoWen');
  await new Promise(resolve => setTimeout(resolve, 200));
  const during = await requestCount();
  const pendingReply = (await page.data('conversationMessages')).at(-1);
  check('等待在助手气泡内且不写入原始消息', pendingReply.role === 'assistant' && pendingReply.pending && pendingReply.text === '小文正在想…' && !(await conversation()).messages.some(m => m.text === '小文正在想…'));
  await mini.screenshot({ path: resolve(output, 'pending.png') });
  await page.callMethod('sendXiaoWen');
  await page.callMethod('startInterview');
  check('请求期间重复发送和切换被阻止', await requestCount() === during && (await conversation()).mode === 'conversation');
  await (await page.$('.xiaowen-composer .ai-stop')).tap();
  await new Promise(resolve => setTimeout(resolve, 200));
  await mini.evaluate(() => getApp().__dialogueQa.pending.shift()());
  await current('editor');
  check('取消后迟到结果不覆盖状态或正文', (await page.data('session.turns')).at(-1).status === 'cancelled' && await page.data('body') === '用户后来修改的正文。');
  check('取消与重试仍在同一助手位置', (await page.data('conversationMessages')).at(-1).id === pendingReply.id && (await page.data('conversationMessages')).at(-1).canRetry);
  await page.callMethod('startInterview');
  await current('interview');
  await enqueue({ defer: true, result: result('finish', '后台整理完成，请核对。', { body: '后台候选正文。' }) });
  await (await page.$('.ai-mode-bar button')).tap();
  await new Promise(resolve => setTimeout(resolve, 200));
  check('结束整理使用三点占位、顶部操作和输入区停止', (await page.data('messages')).at(-1).text === '正在整理…' && !!await page.$('.interview-context .ai-mode-bar button') && !!await page.$('.composer-row .ai-stop') && !await page.$('.reply-pending button'));
  await mini.screenshot({ path: resolve(output, 'composing.png') });
  check('按钮结束在等待结果前已保存普通模式', await mini.evaluate(async () => {
    const snapshot = await getApp().__dialogueQa.services.repository.load();
    return snapshot.sessions[0].conversation.mode === 'conversation';
  }));
  await (await page.$('.interview-back')).tap();
  await current('editor');
  await mini.evaluate(() => getApp().__dialogueQa.pending.shift()());
  await new Promise(resolve => setTimeout(resolve, 300));
  await current('editor');
  check('处理中收起，后台结果回到同会话且不改正文', (await page.data('session.turns')).at(-1).status === 'ready' && await page.data('body') === '用户后来修改的正文。');
  check('JSON v5 备份跨独立仓库恢复保留模式/历史', await mini.evaluate(async () => {
    const q = getApp().__dialogueQa; const raw = await q.services.repository.exportBackup();
    const restored = new (require('storage/repository.js').MiniWorkRepository)(q.services.files, q.root + '-restore');
    await restored.importBackup(raw); const snapshot = await restored.load();
    return JSON.parse(raw).schemaVersion === 5 && snapshot.sessions.length === 1 && snapshot.sessions[0].conversation.materials.length === 2;
  }));
  await mini.screenshot({ path: resolve(output, 'final.png') });
  console.info(JSON.stringify({ passed: passed.length, modelCalls: 0, screenshots: output }));
} finally {
  if (installed) {
    await mini.reLaunch('/pages/home/index');
    await mini.evaluate(async () => {
      const q = getApp().__dialogueQa;
      if (q.write) q.services.writer.write = q.write;
      await q.services.writer.flush();
      q.services.aiConsent.ensure = q.consent;
      for (const { target, state } of q.originals.reverse()) {
        for (const key of Object.keys(target)) if (!(key in state)) delete target[key];
        Object.assign(target, state);
      }
      require('services.js').miniServices = q.original;
      delete getApp().__dialogueQa;
    });
    await mini.reLaunch('/pages/home/index');
  }
  await mini.disconnect();
}
