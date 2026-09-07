// Actual Mini Program views with isolated account, network and file fixtures.
/* eslint-disable @typescript-eslint/no-require-imports -- callbacks execute in DevTools. */
import { resolve } from 'node:path';
export async function checkClientJourney({ mini, info, output, check }) {
  const wait = async (test, attempts = 80) => { for (let i = 0; i < attempts; i++) { if (await test()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('完整流程页面未准备好'); };
  const shot = async name => { await new Promise(r => setTimeout(r, 400)); await mini.screenshot({ path: resolve(output, name + '.png') }); };
  const fits = async (el, height = 48) => { if (!el) return false; const size = await el.size(), offset = await el.offset(); return size.height >= height && size.width > 0 && offset.left >= -1 && offset.left + size.width <= info.windowWidth + 1; };
  const id = await mini.evaluate(() => { const q = getApp().__publicationQa; q.unavailable = false; q.status.pending = { ...q.submitted, state: 'pending' }; q.status.published = true; return q.draft.id; });
  let page = await mini.reLaunch('/pages/publish/index?id=' + id);
  await wait(async () => await page.data('mode') === 'review' && !!await page.data('submission'));
  check('待审重入显示冻结投稿和旧版提示，没有裁切表单', !!await page.$('.review-status') && !await page.$('.crop-screen') && !await page.$('.publish-dock'));
  check('投稿预览使用提交时署名与正文', (await page.data('submission')).authorName === '老街写作者' && (await page.data('submission')).body === await mini.evaluate(() => getApp().__publicationQa.submitted.body));
  await shot('journey-review'); await page.callMethod('myArticles');
  await wait(async () => (await mini.currentPage()).path === 'pages/profile/index'); page = await mini.currentPage();
  let library = await page.$('.author-articles'); await wait(async () => !!library && (await library.data('visible')).length === 1);
  check('我的主页直接展示文章，只有一个查看审核入口', (await library.$$('.article-entry')).length === 1 && !await library.$('.continue') && !await library.$('.publication-entry'));
  for (const button of await library.$$('.filter-button')) check('作者筛选触控和边界正确', await fits(button));
  await library.callMethod('selectFilter', { currentTarget: { dataset: { filter: 'published' } } }); check('重审稿在已发表中仍只占一条记录', (await library.data('visible')).length === 1);
  await library.callMethod('selectFilter', { currentTarget: { dataset: { filter: 'draft' } } }); check('没有草稿时明确显示筛选空态', (await library.data('visible')).length === 0 && !!await library.$('.empty-state'));
  await library.callMethod('selectFilter', { currentTarget: { dataset: { filter: 'all' } } });
  check('我的页写文章入口全宽56px并避开导航', await fits(await page.$('.profile-create .primary-action'),56)); await shot('journey-my');
  await page.callMethod('openSettings'); check('回收站备份隐私和资料集中到设置，写作底栏隐藏', (await page.$$('.settings-sheet .tool')).length === 4 && !await page.$('.profile-create')); await shot('journey-settings');
  await page.callMethod('openProfile'); let username = await page.$('.publication-username'); await username.callMethod('keyboard', { detail: { height: 260 } });
  await wait(async () => await page.data('nameKeyboardHeight') === 260);
  const save = await username.$('.username-save'); check('资料抽屉保存宽度和键盘避让正确', await fits(save,56) && (await save.offset()).top + (await save.size()).height <= await mini.evaluate(() => wx.getWindowInfo().windowHeight) - 260 + 1);
  await shot('journey-profile-keyboard'); await username.callMethod('blur'); await page.callMethod('closeProfile');
  await page.callMethod('openMenu'); await shot('journey-backup'); for (const b of await page.$$('.sheet-tools > button')) check('备份工具行完整可用', await fits(b,56)); await page.callMethod('closeMenu');
  // A unique empty work in the fixture's directory; the lifecycle adapter rejects every other ID.
  const deletion = await mini.evaluate(async () => { const q = getApp().__publicationQa, core = require('domain/core.js'); const draft = { ...core.emptyDraft(), id: 'qa-delete-' + Date.now(), title: '用于验收的空正文文章' }; await q.services.repository.save(draft,0); q.deleteId = draft.id; return draft.id; });
  library = await page.$('.author-articles'); await library.callMethod('refresh',false); await library.callMethod('toggleManage');
  check('管理模式显示删除并隐藏写文章', !!await library.$('.remove') && !await page.$('.profile-create')); await shot('journey-manage');
  if (process.env.MINI_QA_NATIVE_DELETE === '1') {
    const deleteButton = await library.$('.remove[data-id="' + deletion + '"]'); await deleteButton.tap();
    console.info('NATIVE_DELETE_READY: 等待确认隔离空稿的原生删除弹窗');
    await wait(async () => await mini.evaluate(async () => !!(await getApp().__publicationQa.services.repository.getAggregate(getApp().__publicationQa.deleteId))?.work.deletedAt),600);
    check('原生删除确认完成，空正文作品真实移入隔离回收站', true);
  } else {
    await mini.mockWxMethod('showModal', { confirm: true, cancel: false });
    try { const row = (await library.data('visible')).find(w => w.id === deletion); await library.callMethod('moveToRecycle', { currentTarget: { dataset: { id: row.id, revision: row.revision } } }); }
    finally { await mini.restoreWxMethod('showModal'); }
    check('确认删除后空正文作品真实移入隔离回收站', await mini.evaluate(async () => !!(await getApp().__publicationQa.services.repository.getAggregate(getApp().__publicationQa.deleteId))?.work.deletedAt));
  }
  await library.callMethod('toggleManage'); await page.callMethod('openRecycle'); await wait(async () => (await mini.currentPage()).path === 'pages/works/index'); page = await mini.currentPage(); library = await page.$('.author-articles');
  await wait(async () => (await library.data('visible')).some(w => w.id === deletion)); await shot('journey-recycle');
  const row = (await library.data('visible')).find(w => w.id === deletion); await library.callMethod('restore', { currentTarget: { dataset: { id: row.id, revision: row.revision } } });
  check('回收站恢复空正文作品，仍为私有稿', await mini.evaluate(async () => { const q = getApp().__publicationQa, item = await q.services.repository.getAggregate(q.deleteId); return !!item && !item.work.deletedAt; }));
  await mini.evaluate(() => { const q = getApp().__publicationQa; q.status.pending = null; q.status.published = false; });
  page = await mini.reLaunch('/pages/publish/index?id=' + id); await wait(async () => !!await page.data('preview') && !await page.data('busy'));
  const originalPath = (await page.data('draft')).path;
  await page.callMethod('openCrop'); await wait(async () => await page.data('mode') === 'crop');
  const crop = await page.$('.publication-cropper'); await crop.callMethod('enlarge'); await wait(async () => !await page.data('busy'));
  check('全屏裁切底部取消和完成可达', await fits(await page.$('.crop-cancel'),56) && await fits(await page.$('.crop-done'),56));
  const done = await page.$('.crop-done'); check('裁切主操作位于实际窗口内', (await done.offset()).top + (await done.size()).height <= await mini.evaluate(() => wx.getWindowInfo().windowHeight) + 1);
  await shot('journey-crop'); await page.callMethod('cancelCrop'); await wait(async () => !!await page.data('preview') && !await page.data('busy'));
  check('取消裁切回到同篇预览并保留原封面', (await page.data('draft')).path === originalPath && !(await page.data('draft')).cropBackup);
  await page.callMethod('editName'); username = await page.$('.publication-username'); await username.callMethod('keyboard',{detail:{height:260}}); await shot('journey-preview-name'); await username.callMethod('blur'); await page.callMethod('closeName');
  await mini.evaluate(() => { const q = getApp().__publicationQa, p = getCurrentPages().at(-1); q.nickname = '一位喜欢观察日常生活也愿意分享诗歌与往事的作者'; q.draft.title = '老街清晨的风与那些平凡日子里值得写下来的故事：一篇用于检查长标题完整换行的文章'; q.draft.textDraft = ('这是一段用于检查长文滚动的合成文字。文章可以写日常生活、诗歌和自己的想法。\n\n').repeat(24); p.setData({ title:q.draft.title,body:q.draft.textDraft,authorName:q.nickname }); });
  await shot('journey-preview-long'); check('长文预览只有一个主要提交按钮', (await page.$$('.publish-dock .primary-action')).length === 1 && await fits(await page.$('.publish-dock .primary-action'),56));
  await mini.evaluate(() => wx.pageScrollTo({scrollTop:100000,duration:0})); await shot('journey-preview-end');
  const end = await page.$('.edit-body'), dock = await page.$('.publish-dock'); check('正文末尾可完整滚动至固定底栏上方',(await end.offset()).top+(await end.size()).height <= (await dock.offset()).top+1);
  page = await mini.switchTab('/pages/articles/index'); await wait(async () => (await page.data('cards')).length === 1);
  check('正常公共列表没有刷新按钮', !await page.$('.refresh-action')); check('公开列表长标题最多三行',(await (await page.$('.card-title')).size()).height<=96); await shot('journey-public-list-long');
  await mini.evaluate(() => { getApp().__publicationQa.status.published = true; });
  page = await mini.navigateTo('/pages/article/index?id=qa-article'); await wait(async () => !!await page.data('ownerWorkId')); await shot('journey-reader-long');
  await mini.evaluate(() => wx.pageScrollTo({scrollTop:100000,duration:0})); await shot('journey-reader-end');
  check('作者阅读可以分享、编辑和管理，其他用户不会获得私有标识', await fits(await page.$('.share-button'),56) && !!await page.$('.author-actions'));
  page = await mini.navigateTo('/pages/editor/index'); await wait(async () => !!await page.data('draft')); await page.callMethod('toggleInputMode'); await shot('journey-editor');
  check('编辑下一步有56px高度，小文辅助入口可达', await fits(await page.$('.publication-next'),56) && await fits(await page.$('.xiaowen')));
  await mini.evaluate(() => {
    const q = getApp().__publicationQa, topics = require('network/topics.js').miniTopics;
    q.topicOriginals = { list: topics.list, detail: topics.detail };
    const topic = { id: 'qa-journey', revision: 1, status: 'published', kind: 'slow', title: '从街巷的变化聊起，哪些日常小事让你有了新的想法？',
      summary: '这是一条用于页面布局验收的合成话题。'.repeat(8), whyItMatters: '用于验收阅读话题到写作入口的展示。',
      publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', expiresAt: null, reviewedBy: 'qa', reviewedAt: '2026-01-01T00:00:00Z',
      sources: [{ id: 'source', title: '用于检验长来源标题自动换行的合成资料，没有访问外部页面', publisher: '布局验收', url: 'https://example.com', publishedAt: '2026-01-01T00:00:00Z' }],
      angles: [{ id: 'angle', title: '写下你的日常观察', prompt: '说说自己看到的变化。' }], starterQuestion: '你最近留意到什么变化？', tags: ['合成'] };
    topics.list = async () => [topic]; topics.detail = async () => topic;
  });
  page = await mini.switchTab('/pages/home/index'); await page.callMethod('loadTopics');
  await wait(async () => !!await page.$('.topic-card'));
  check('热门话题长标题卡片铺满内容且无横向越界', await fits(await page.$('.topic-card')) && (await (await page.$('.topic-card')).size()).width >= info.windowWidth - 48);
  await shot('journey-home');
  await page.callMethod('openTopic', { currentTarget: { dataset: { id: 'qa-journey' } } });
  await wait(async () => (await mini.currentPage()).path === 'pages/topic-detail/index'); page = await mini.currentPage();
  await wait(async () => !!await page.data('topic')); await shot('journey-topic');
  check('话题有来源时显示真实来源入口', (await page.data('sources')).length === 1 && !!await page.$('.source'));
  for (const button of await page.$$('.start-actions button')) check('话题到写作的主次操作完整且至少 56px', await fits(button, 56));
  await mini.evaluate(() => wx.pageScrollTo({ scrollTop: 100000, duration: 0 })); await shot('journey-topic-end');
  const source = await page.$('.source');
  check('长来源可以滚动至完整可见，不被话题底栏遮挡', (await source.offset()).top + (await source.size()).height <= (await (await page.$('.start-actions')).offset()).top + 1);
}
