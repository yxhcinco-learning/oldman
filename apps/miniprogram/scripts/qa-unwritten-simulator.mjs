// Loaded by qa-dialogue-simulator.mjs after installing its isolated service fixture.
import { resolve } from 'node:path';

const wait = () => new Promise(resolve => setTimeout(resolve, 100));

export async function runUnwrittenRegression({ mini, output, check, current }) {
  const snapshot = () => mini.evaluate(async () => {
    const q = getApp().__dialogueQa;
    await q.services.writer.flush();
    const value = await q.services.repository.load();
    return { ids: value.works.map(work => work.id), recoveryId: value.recovery?.draft.id,
      recoveryMode: value.recoverySession?.conversation?.mode,
      aggregates: value.aggregates.map(item => ({ id: item.work.id, body: item.work.draft.textDraft,
        composer: item.writingState?.composer, mode: item.session?.conversation?.mode })),
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
        return component;
      }
      await wait();
    }
    throw new Error('空稿回归的我的文章组件未就绪');
  };

  let page = await editable('editor');
  await page.callMethod('closeXiaoWen');
  check('纯空新编辑没有标题、正文或待确认语音', !(await page.data('draft.title')).trim() && !await page.data('body') && !await page.data('draft.pendingVoice'));
  await library('纯空编辑退出', 0);

  await mini.reLaunch('/pages/editor/index');
  page = await editable('editor');
  if (await page.data('draft.inputMode') !== 'voice') await page.callMethod('toggleInputMode');
  await page.callMethod('pressBodyVoice');
  for (let attempt = 0; attempt < 30 && await page.data('voicePhase') !== 'recording'; attempt++) await wait();
  check('无转写场景确实启动隔离录音', await page.data('voicePhase') === 'recording');
  await mini.evaluate(() => {
    const q = getApp().__dialogueQa;
    q.speechEvent({ type: 'ready' });
    q.recorder.frame(new ArrayBuffer(3200), true);
  });
  await page.callMethod('releaseVoice');
  for (let attempt = 0; attempt < 30 && await page.data('voiceBusy'); attempt++) await wait();
  check('无转写松手后保持空白且结束收音', !await page.data('voiceBusy') && !await page.data('body') && !await page.data('draft.pendingVoice')
    && await mini.evaluate(() => { const q = getApp().__dialogueQa; return q.speechFrames.length === 3200 && JSON.stringify(q.speechCommands) === '["end"]'; }));
  await library('无转写录音退出', 0);

  await mini.reLaunch('/pages/editor/index?xiaowen=compose');
  page = await editable('editor');
  const id = await page.data('draft.id');
  await page.callMethod('startInterview');
  page = await editable('interview');
  const conversation = await page.data('session.conversation');
  check('开启访谈只有静态开场且没有模型调用', await page.data('draft.id') === id && conversation.mode === 'interview'
    && conversation.messages.length > 0 && !conversation.messages.some(message => message.role === 'user') && (await snapshot()).requests === 0);
  let stored = await snapshot();
  check('静态访谈只保存同 ID 恢复上下文', stored.ids.length === 0 && stored.recoveryId === id && stored.recoveryMode === 'interview');
  await mini.screenshot({ path: resolve(output, 'unwritten-interview-opening.png') });
  await page.callMethod('closeInterview');
  page = await editable('editor');
  check('关闭访谈返回原编辑器，不创建新 ID', await page.data('draft.id') === id && await page.data('session.conversation.mode') === 'interview');
  await page.callMethod('openXiaoWen');
  page = await editable('interview');
  check('再次打开仍为同一访谈和开场', await page.data('draft.id') === id
    && JSON.stringify(await page.data('session.conversation.messages')) === JSON.stringify(conversation.messages));
  await page.callMethod('onHide');
  await page.callMethod('onShow');
  page = await editable('interview');
  stored = await snapshot();
  check('前台恢复保留同 ID、无空文章且未请求模型', await page.data('draft.id') === id && stored.ids.length === 0
    && stored.recoveryId === id && stored.requests === 0 && !await page.data('error'));
  await library('静态访谈往返后退出', 0);
  await mini.screenshot({ path: resolve(output, 'unwritten-empty-library.png') });

  await mini.reLaunch('/pages/interview/index?id=' + encodeURIComponent(id));
  page = await editable('interview');
  check('访谈页面重载从恢复记录取回同 ID', await page.data('draft.id') === id && await page.data('session.conversation.mode') === 'interview');
  const unsent = '这是尚未发送的第一句经历';
  await (await page.$('.composer-row textarea')).input(unsent);
  for (let attempt = 0; attempt < 30 && await page.data('composer') !== unsent; attempt++) await wait();
  await page.callMethod('saveComposer');
  stored = await snapshot();
  check('首句未发送文字保存为原 ID 的唯一文章', stored.ids.length === 1 && stored.ids[0] === id && stored.aggregates[0]?.composer === unsent
    && stored.aggregates[0]?.mode === 'interview' && !stored.recoveryId && stored.requests === 0);
  await library('首句未发送文字保存后', 1, id);
  await mini.screenshot({ path: resolve(output, 'unwritten-first-input-library.png') });

  await mini.reLaunch('/pages/editor/index?id=' + encodeURIComponent(id));
  page = await editable('editor');
  check('首句未发送话在编辑器恢复，不丢访谈上下文', await page.data('draft.id') === id && await page.data('xiaowenComposer') === unsent);
  if (await page.data('draft.inputMode') !== 'text') await page.callMethod('toggleInputMode');
  const body = '第一句正文接着写在同一篇文章里。';
  await (await page.$('.body-input')).input(body);
  for (let attempt = 0; attempt < 30 && await page.data('body') !== body; attempt++) await wait();
  await page.callMethod('saveNow');
  stored = await snapshot();
  check('第一句正文与未发送话归同一篇，不生成重复文章', stored.ids.length === 1 && stored.ids[0] === id
    && stored.aggregates[0]?.body === body && stored.aggregates[0]?.composer === unsent && stored.requests === 0);
  await library('正文继续写作后', 1, id);
  await mini.screenshot({ path: resolve(output, 'unwritten-written-library.png') });
  check('列表同步和发表状态均使用替身，真实账号请求为零', await mini.evaluate(() => {
    const q = getApp().__dialogueQa;
    return q.syncCalls > 0 && q.publicationCalls > 0 && q.blockedAccountRequests === 0 && q.requests.length === 0;
  }));
}
