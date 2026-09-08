// Loaded by qa-dialogue-simulator.mjs after installing its isolated service fixture.
/* eslint-disable @typescript-eslint/no-require-imports -- DevTools evaluate executes CommonJS in the app service. */
import { resolve } from 'node:path';

const wait = () => new Promise(resolve => setTimeout(resolve, 100));

export async function runUnwrittenRegression({ mini, output, check, current }) {
  const snapshot = () => mini.evaluate(async () => {
    const q = getApp().__dialogueQa;
    await q.services.writer.flush();
    const value = await q.services.repository.load();
    const core = require('domain/core.js');
    return { ids: value.works.map(work => work.id), recoveryId: value.recovery?.draft.id,
      recoveryMode: value.recoverySession?.conversation?.mode,
      aggregates: value.aggregates.map(item => ({ id: item.work.id, title: item.work.draft.title,
        body: core.documentOf(item.work.draft).body, revision: item.work.revision })),
      issues: value.issues, requests: q.requests.length };
  });
  const editable = async path => {
    const target = await current(path);
    for (let attempt = 0; attempt < 60; attempt++) {
      if (!await target.data('readOnly') && !await target.data('loadError') && !await target.data('error')) return target;
      await wait();
    }
    throw new Error(`空稿页面未恢复编辑：${path} ${JSON.stringify({ readOnly: await target.data('readOnly'), error: await target.data('error'), loadError: await target.data('loadError') })}`);
  };
  const begin = async (name, compose = false) => {
    await mini.reLaunch('/pages/login/index');
    await mini.evaluate(name => getApp().__dialogueQa.resetUnwritten(name), name);
    await mini.reLaunch('/pages/editor/index' + (compose ? '?xiaowen=compose' : ''));
    return editable('editor');
  };
  const library = async (label, expected, id) => {
    await mini.reLaunch('/pages/works/index');
    for (let attempt = 0; attempt < 60; attempt++) {
      const target = await mini.currentPage();
      const component = target?.path === 'pages/works/index' ? await target.$('.author-articles') : null;
      if (component && !await component.data('loading')) {
        const value = await component.data();
        check(`${label}：我的文章 total、卡片和空态一致`, !value.issue && value.total === expected && value.cards.length === expected
          && value.visible.length === expected && value.empty === (expected === 0) && (!id || value.visible[0]?.id === id));
        if (expected === 0) check(`${label}：显示真实空态文案`, await (await component.$('.empty-title')).text() === '还没有写下文章');
        const stored = await snapshot();
        check(`${label}：仓储与列表数量一致且无读取问题`, stored.ids.length === expected && stored.issues.length === 0);
        return;
      }
      await wait();
    }
    throw new Error('空稿回归的我的文章组件未就绪');
  };
  const input = async (page, selector, field, text) => {
    await (await page.$(selector)).input(text);
    for (let attempt = 0; attempt < 30 && await page.data(field) !== text; attempt++) await wait();
    check(`${field}实际输入组件接收文字`, await page.data(field) === text);
  };
  const durable = async (label, id, expected, markers = [], queue = false) => {
    const value = await mini.evaluate(async ({ id, markers, queue }) => {
      const q = getApp().__dialogueQa;
      const repository = q.services.repository;
      await q.services.writer.flush();
      const operation = queue ? await repository.queueMutation(id) : null;
      const raws = [];
      // Read only the active isolated repository, including recovery/context and work files.
      if (!repository.paths.root.startsWith(q.root + '/')) throw new Error('回归目录不在隔离根内');
      for (const directory of [repository.paths.root, repository.paths.works, repository.paths.quarantine]) {
        if (!await q.services.files.exists(directory)) continue;
        for (const name of await q.services.files.list(directory)) {
          if (/\.json(?:\.(?:tmp|bak|old))?$/.test(name)) raws.push(await q.services.files.readText(directory + '/' + name));
        }
      }
      const backupRaw = await repository.exportBackup();
      const backup = JSON.parse(backupRaw);
      const leaks = [];
      const visit = (value, path) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if ((key === 'pendingVoice' || key === 'composer') && typeof child === 'string' && child.trim()) leaks.push(path + '.' + key);
          if (key === 'segmentEdit' && child !== null) leaks.push(path + '.' + key);
          visit(child, path + '.' + key);
        }
      };
      raws.forEach((raw, index) => visit(JSON.parse(raw), 'disk' + index));
      visit(backup, 'backup');
      visit(operation, 'cloud');
      const fresh = new (require('storage/repository.js').MiniWorkRepository)(q.services.files, q.activeBase);
      const loaded = await fresh.load(id);
      const recoveredDraft = loaded.recovery?.draft ?? loaded.works.find(work => work.id === id)?.draft;
      const recoveredState = loaded.recoveryWritingState ?? loaded.writingStates?.find(item => item.workId === id)?.state;
      return { diskFiles: raws.length, leaks, markerLeaks: markers.filter(marker => [...raws, backupRaw, JSON.stringify(operation)].some(raw => raw.includes(marker))),
        backupIds: backup.works.map(work => work.id), backupSessionIds: (backup.sessions ?? []).map(session => session.workId),
        recoveredPending: recoveredDraft?.pendingVoice ?? '', recoveredComposer: recoveredState?.composer ?? '',
        recoveredMessages: loaded.recoverySession?.conversation?.messages.length ?? loaded.sessions.find(session => session.workId === id)?.conversation?.messages.length ?? 0,
        operationId: operation?.workId, operationKind: operation?.kind, operationHasSnapshot: Boolean(operation?.snapshot) };
    }, { id, markers, queue });
    check(`${label}：实际文件、备份${queue ? '及新云快照' : ''}不含输入框`, value.leaks.length === 0 && value.markerLeaks.length === 0);
    check(`${label}：新仓储从磁盘不恢复输入框`, !value.recoveredPending && !value.recoveredComposer);
    check(`${label}：备份文章数量正确`, value.backupIds.length === expected && (expected ? value.backupIds[0] === id : value.backupSessionIds.length === 0));
    if (queue) check(`${label}：新建云操作只有当前同 ID 文章`, value.operationId === id && value.operationKind === 'create' && value.operationHasSnapshot);
    return value;
  };
  const record = async (page, transcript = '') => {
    if (await page.data('draft.inputMode') !== 'voice') await page.callMethod('toggleInputMode');
    await mini.evaluate(() => { const q = getApp().__dialogueQa; q.speechFrames = []; q.speechCommands = []; });
    await page.callMethod('pressBodyVoice');
    for (let attempt = 0; attempt < 30 && await page.data('voicePhase') !== 'recording'; attempt++) await wait();
    check('语音场景确实启动隔离录音', await page.data('voicePhase') === 'recording');
    await mini.evaluate(transcript => {
      const q = getApp().__dialogueQa;
      q.speechEvent({ type: 'ready' });
      q.recorder.frame(new ArrayBuffer(3200), true);
      if (transcript) q.speechEvent({ type: 'transcript', text: transcript, final: true });
    }, transcript);
    await page.callMethod('releaseVoice');
    for (let attempt = 0; attempt < 30 && await page.data('voiceBusy'); attempt++) await wait();
    check('松手后隔离音频排空且只发送一次结束', !await page.data('voiceBusy') && await mini.evaluate(() => {
      const q = getApp().__dialogueQa;
      return q.speechFrames.length === 3200 && JSON.stringify(q.speechCommands) === '["end"]';
    }));
  };
  const send = async (page, text, response, target = 'interview') => {
    await mini.evaluate(result => getApp().__dialogueQa.queue.push({ result }), response);
    await input(page, '.composer-row textarea', 'composer', text);
    await (await page.$('.send')).tap();
    await wait();
    return editable(target);
  };

  let page = await begin('voice');
  check('纯空新编辑没有标题、正文或待确认语音', !(await page.data('draft.title')).trim() && !await page.data('body') && !await page.data('draft.pendingVoice'));
  await library('纯空编辑退出', 0);
  await mini.reLaunch('/pages/editor/index');
  page = await editable('editor');
  await record(page);
  check('无转写松手后保持空白', !await page.data('body') && !await page.data('draft.pendingVoice'));
  await library('无转写录音退出', 0);

  await mini.reLaunch('/pages/editor/index');
  page = await editable('editor');
  const pendingId = await page.data('draft.id');
  const pending = '这句语音正在等待我确认';
  await record(page, pending);
  check('语音识别有文字仍只是待确认框', await page.data('draft.pendingVoice') === pending && !await page.data('body') && !await page.data('saved'));
  check('中间语音处理成功但没有文章已保存状态', await page.callMethod('saveNow') && !await page.data('saved') && (await snapshot()).ids.length === 0);
  await mini.screenshot({ path: resolve(output, 'intermediate-pending-voice.png') });
  await durable('语音确认前', pendingId, 0, [pending]);
  await library('待确认语音退出', 0);
  await mini.screenshot({ path: resolve(output, 'intermediate-voice-empty-library.png') });
  await mini.reLaunch('/pages/editor/index?id=' + encodeURIComponent(pendingId));
  page = await editable('editor');
  check('本次内存重新打开仍可确认原语音', await page.data('draft.id') === pendingId && await page.data('draft.pendingVoice') === pending);
  await page.callMethod('completePendingVoice');
  await page.callMethod('saveNow');
  let stored = await snapshot();
  check('确认语音才以原 ID 建立唯一文章', stored.ids.length === 1 && stored.ids[0] === pendingId && stored.aggregates[0]?.body === pending && !await page.data('draft.pendingVoice'));
  const savedRevision = stored.aggregates[0].revision;
  const anotherPending = '第二段还没有确认的语音';
  await record(page, anotherPending);
  await page.callMethod('saveNow');
  check('既有文章只改输入框不增加文章 revision', (await snapshot()).aggregates[0]?.revision === savedRevision);
  await durable('已有正文和新待确认语音', pendingId, 1, [anotherPending], true);
  await library('语音确认并继续录入', 1, pendingId);
  await mini.screenshot({ path: resolve(output, 'intermediate-voice-written-library.png') });

  page = await begin('conversation', true);
  const id = await page.data('draft.id');
  const unsentChat = '小文输入框里尚未发送的文字';
  await input(page, '.xiaowen-composer textarea', 'xiaowenComposer', unsentChat);
  check('小文未发送输入处理成功且不建稿', await page.callMethod('saveNow') && !await page.data('saved') && (await snapshot()).ids.length === 0);
  await durable('小文未发送输入', id, 0, [unsentChat]);
  await page.callMethod('closeXiaoWen');
  await page.callMethod('openXiaoWen');
  check('收起重开小文保留本次内存输入', await page.data('xiaowenComposer') === unsentChat);
  await page.callMethod('startInterview');
  page = await editable('interview');
  const opening = await page.data('session.conversation');
  check('开启访谈只有静态开场且不请求模型', await page.data('draft.id') === id && opening.mode === 'interview'
    && opening.messages.length > 0 && !opening.messages.some(message => message.role === 'user') && (await snapshot()).requests === 0);
  const unsentInterview = '访谈输入框里尚未发送的第一句经历';
  await input(page, '.composer-row textarea', 'composer', unsentInterview);
  check('访谈首句未发送文字处理成功但仍零篇', await page.callMethod('saveComposer') && (await snapshot()).ids.length === 0);
  await page.callMethod('onHide');
  await page.callMethod('onShow');
  page = await editable('interview');
  check('前台恢复保留同 ID 与本次输入，不建立空文章', await page.data('draft.id') === id && await page.data('composer') === unsentInterview && (await snapshot()).ids.length === 0);
  await page.callMethod('closeInterview');
  page = await editable('editor');
  check('仅访谈输入时可以返回原编辑器', await page.data('draft.id') === id && await page.data('xiaowenComposer') === unsentInterview && !await page.data('error'));
  await page.callMethod('openXiaoWen');
  page = await editable('interview');
  check('再次打开不增加静态开场且保留输入', await page.data('composer') === unsentInterview && JSON.stringify(await page.data('session.conversation.messages')) === JSON.stringify(opening.messages));
  await mini.screenshot({ path: resolve(output, 'intermediate-unsent-interview.png') });
  await durable('访谈未发送输入', id, 0, [unsentChat, unsentInterview]);
  await library('访谈未发送文字退出', 0);
  await mini.reLaunch('/pages/interview/index?id=' + encodeURIComponent(id));
  page = await editable('interview');
  check('页面重载仍从本次内存继续未发送输入', await page.data('composer') === unsentInterview && await page.data('draft.id') === id);
  const sent = '我在工厂工作了三十年。';
  page = await send(page, sent, { answer: '哪次经历让您印象最深？', dialogue: { intent: 'reply', material: { text: sent } }, citedVersionIds: [] });
  check('发送对话和收到回复仍不建立文章', (await snapshot()).ids.length === 0 && (await snapshot()).requests === 1
    && (await page.data('session.conversation.messages')).some(message => message.role === 'user' && message.text === sent));
  const persistedDialogue = await durable('已发送对话独立恢复', id, 0, [unsentChat, unsentInterview]);
  check('新仓储可从实际上下文文件恢复已发送会话', persistedDialogue.diskFiles > 0 && persistedDialogue.recoveredMessages > opening.messages.length);
  await page.callMethod('closeInterview');
  page = await editable('editor');
  check('发送对话后返回仍为同一未成稿上下文', await page.data('draft.id') === id && !await page.data('body') && !await page.data('saved'));
  await library('发送对话后返回', 0);
  await mini.screenshot({ path: resolve(output, 'intermediate-dialogue-empty-library.png') });
  await mini.reLaunch('/pages/interview/index?id=' + encodeURIComponent(id));
  page = await editable('interview');
  const body = '我在工厂工作了三十年，也留下许多难忘的回忆。';
  page = await send(page, '请把刚才的经历整理成文章', { answer: '已整理，请确认是否采用。', dialogue: { intent: 'finish' }, body, citedVersionIds: [] }, 'editor');
  const turn = (await page.data('session.turns')).at(-1);
  check('生成候选仍未建立文章', Boolean(turn?.result?.body) && !await page.data('body') && (await snapshot()).ids.length === 0);
  await durable('未采用候选', id, 0);
  await library('候选未采用时返回', 0);
  await mini.reLaunch('/pages/editor/index?id=' + encodeURIComponent(id) + '&xiaowen=compose');
  page = await editable('editor');
  await page.callMethod('openCandidate', turn.id);
  await mini.screenshot({ path: resolve(output, 'intermediate-candidate-preview.png') });
  await (await page.$('.candidate-apply')).tap();
  page = await editable('editor');
  stored = await snapshot();
  check('明确采用候选才建立同 ID 唯一文章', stored.ids.length === 1 && stored.ids[0] === id && stored.aggregates[0]?.body === body);
  const afterArticle = '文章建立后仍未发送的补充问题';
  await input(page, '.xiaowen-composer textarea', 'xiaowenComposer', afterArticle);
  await page.callMethod('saveNow');
  await durable('采用正文后仍排除未发送输入', id, 1, [afterArticle, unsentChat, unsentInterview], true);
  await library('候选明确采用后', 1, id);
  await mini.screenshot({ path: resolve(output, 'intermediate-applied-library.png') });

  page = await begin('title');
  const titleId = await page.data('draft.id');
  await page.callMethod('openTitle');
  await input(page, '.title-input', 'titleInput', '只有标题也算一篇文章');
  await page.callMethod('confirmTitle');
  await page.callMethod('saveNow');
  stored = await snapshot();
  check('实际标题非空即可建立同 ID 唯一文章', stored.ids.length === 1 && stored.ids[0] === titleId
    && stored.aggregates[0]?.title === '只有标题也算一篇文章' && !stored.aggregates[0]?.body);
  await library('仅标题文章', 1, titleId);
  await mini.reLaunch('/pages/editor/index?id=' + encodeURIComponent(titleId));
  page = await editable('editor');
  await page.callMethod('openTitle');
  await input(page, '.title-input', 'titleInput', '');
  await page.callMethod('confirmTitle');
  await page.callMethod('saveNow');
  stored = await snapshot();
  check('已有文章清空标题正文仍保留原 ID', stored.ids.length === 1 && stored.ids[0] === titleId && !stored.aggregates[0]?.title && !stored.aggregates[0]?.body);
  await durable('已有文章清空后的保护', titleId, 1, [], true);
  await library('已有文章清空后', 1, titleId);

  page = await begin('text');
  const textId = await page.data('draft.id');
  if (await page.data('draft.inputMode') !== 'text') await page.callMethod('toggleInputMode');
  const typedBody = '这是一句直接写下来的正文。';
  await input(page, '.body-input', 'body', typedBody);
  await page.callMethod('saveNow');
  stored = await snapshot();
  check('直接输入正文建立同 ID 唯一文章', stored.ids.length === 1 && stored.ids[0] === textId && stored.aggregates[0]?.body === typedBody);
  await durable('直接输入正文后', textId, 1, [], true);
  await library('直接输入正文后', 1, textId);
  check('列表同步和发表状态均使用替身，只有两次本地模型替身响应', await mini.evaluate(() => {
    const q = getApp().__dialogueQa;
    return q.syncCalls > 0 && q.publicationCalls > 0 && q.blockedAccountRequests === 0 && q.requests.length === 2 && q.queue.length === 0;
  }));
}
