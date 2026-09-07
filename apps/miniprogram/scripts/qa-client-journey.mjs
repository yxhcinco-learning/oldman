// Additional presentation coverage inside the publication runner's isolated fixture.
/* eslint-disable @typescript-eslint/no-require-imports -- callbacks run in DevTools. */
import { resolve } from 'node:path';

export async function checkClientJourney({ mini, info, output, check }) {
  const wait = async test => { for (let i = 0; i < 80; i++) { if (await test()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('完整流程页面未准备好'); };
  const shot = async name => { await new Promise(r => setTimeout(r, 500)); await mini.screenshot({ path: resolve(output, name + '.png') }); };
  const fits = async (element, height = 48) => { const size = await element.size(), offset = await element.offset(); return size.height >= height && size.width > 0 && offset.left >= -1 && offset.left + size.width <= info.windowWidth + 1; };
  const id = await mini.evaluate(() => { const q = getApp().__publicationQa; q.unavailable = false; return q.draft.id; });
  let page = await mini.reLaunch('/pages/publish/index?id=' + id);
  await wait(async () => await page.data('mode') === 'result');
  check('重新进入待审作品显示审核结果，不堆叠裁切表单', !!await page.$('.result') && !await page.$('.crop-tabs') && !await page.$('.publish-dock'));
  check('审核结果主操作铺满且不被默认按钮收窄', await fits(await page.$('.result .primary-action'), 56) && (await (await page.$('.result .primary-action')).size()).width >= info.windowWidth - 48);
  await shot('journey-pending');
  await page.callMethod('myArticles'); await wait(async () => (await mini.currentPage()).path === 'pages/works/index'); page = await mini.currentPage();
  await wait(async () => (await page.data('visible')).length === 1);
  await page.callMethod('selectFilter', { currentTarget: { dataset: { filter: 'pending' } } });
  check('作品筛选保留唯一待审记录，管理页无旧首页装饰和保存标签', (await page.data('visible')).length === 1 && !await page.$('.letter-drawing') && !await page.$('.cover') && !(await (await page.$('.work-card')).text()).includes('本机已保存'));
  for (const button of await page.$$('.work-filters button')) check('作品筛选触控与边界正确', await fits(button));
  await page.callMethod('selectFilter', { currentTarget: { dataset: { filter: 'draft' } } });
  await wait(async () => !!await page.$('.empty-state'));
  check('筛选空态明确且可切回其他文章', (await (await page.$('.empty-state')).text()).includes('还没有草稿'));
  await page.callMethod('selectFilter', { currentTarget: { dataset: { filter: 'all' } } });
  await page.callMethod('toggleManage'); await wait(async () => !!await page.$('.remove'));
  check('管理模式保留删除入口并隐藏写作底栏', await fits(await page.$('.remove')) && !await page.$('.create-dock'));
  await shot('journey-manage'); await page.callMethod('toggleManage');
  await (await page.$('.journey-header')).callMethod('back');
  await wait(async () => (await mini.currentPage()).path === 'pages/profile/index');
  check('根我的文章返回我的 Tab', (await mini.currentPage()).path === 'pages/profile/index');
  page = await mini.currentPage(); await wait(async () => !!await page.data('account'));
  await page.callMethod('openProfile');
  let username = await page.$('.publication-username');
  await username.callMethod('keyboard', { detail: { height: 260 } });
  await wait(async () => await page.data('nameKeyboardHeight') === 260);
  check('资料用户名保存按钮显式铺满组件', (await (await username.$('.username-save')).size()).width >= info.windowWidth - 52);
  check('资料抽屉键盘避让且关闭入口可达', await fits(await page.$('.sheet-heading button')));
  const profileSave = await username.$('.username-save');
  check('资料关闭入口避开微信原生胶囊区域', (await (await page.$('.sheet-heading button')).offset()).top >= await page.data('navigationHeight'));
  check('资料保存入口在键盘上方完整可见', (await profileSave.offset()).top + (await profileSave.size()).height <= await mini.evaluate(() => wx.getWindowInfo().windowHeight) - 260 + 1);
  await shot('journey-profile-keyboard'); await username.callMethod('blur'); await page.callMethod('closeProfile');
  await page.callMethod('openMenu'); await shot('journey-backup');
  for (const button of await page.$$('.sheet-tools > button')) check('备份工具行适配当前宽度', await fits(button, 56));
  await page.callMethod('closeMenu');

  await mini.evaluate(() => { const q = getApp().__publicationQa; q.status.pending = null; q.status.published = false; });
  page = await mini.navigateTo('/pages/publish/index?id=' + id); await wait(async () => !!await page.data('title'));
  const cropper = await page.$('.publication-cropper');
  for (const button of await cropper.$$('.crop-control')) check('裁切加减按钮固定 48px、不拉伸', Math.abs((await button.size()).width - 48) < 1 && await fits(button));
  for (const button of await page.$$('.crop-tabs button')) check('两种裁切标签完整且不越界', await fits(button));
  check('封面准备主操作铺满内容区', (await (await page.$('.publish-dock .primary-action')).size()).width >= info.windowWidth - 48);
  await shot('journey-cover');
  if (info.windowWidth <= 370) {
    await mini.evaluate(() => wx.pageScrollTo({ scrollTop: 100000, duration: 0 })); await shot('journey-cover-end');
    const confirmation = await page.$('.crop-confirm');
    check('小屏封面确认可以滚动至底栏上方', (await confirmation.offset()).top + (await confirmation.size()).height <= (await (await page.$('.publish-dock')).offset()).top + 1);
  }
  await page.callMethod('preparePreview'); await wait(async () => await page.data('mode') === 'preview');
  check('文章预览默认专注正文、分发效果可主动展开', !await page.$('.sample-card') && !!await page.$('.examples-toggle'));
  await page.callMethod('toggleExamples'); await wait(async () => !!await page.$('.sample-card'));
  check('展开后可检查真实列表与好友效果', !!await page.$('.sample-share'));
  await page.callMethod('toggleExamples');
  await page.callMethod('editName'); username = await page.$('.publication-username');
  await username.callMethod('keyboard', { detail: { height: 260 } });
  await wait(async () => await page.data('nameKeyboardHeight') === 260);
  check('预览就地改名抽屉使用同一键盘避让', await fits(await page.$('.name-heading button')) && (await (await username.$('.username-save')).size()).width >= info.windowWidth - 52);
  const closeName = await page.$('.name-heading button'), nameSave = await username.$('.username-save');
  check('改名关闭按钮与抽屉右边距对齐', Math.abs((await closeName.offset()).left + (await closeName.size()).width - info.windowWidth + (info.windowWidth <= 370 ? 20 : 24)) < 1);
  const windowHeight = await mini.evaluate(() => wx.getWindowInfo().windowHeight);
  check('改名保存入口保持在键盘可用区内', (await nameSave.offset()).top + (await nameSave.size()).height <= windowHeight - 260 + 1);
  await shot('journey-preview-keyboard'); await username.callMethod('blur'); await page.callMethod('closeName');
  await mini.evaluate(() => {
    const q = getApp().__publicationQa;
    q.draft.title = '关于日常与远方的思考'.repeat(8); q.nickname = '沿着街巷慢慢写下四季生活的作者';
    q.draft.textDraft = ('这是用于布局验收的合成文字，写下生活、诗歌和自己的想法。\n\n').repeat(24);
    const p = getCurrentPages().at(-1); p.setData({ preview: { ...p.data.preview, title: q.draft.title, body: q.draft.textDraft, authorName: q.nickname } });
  });
  await shot('journey-preview-long');
  for (const button of await page.$$('.publish-dock button')) check('长文预览的底部主次操作均可达', await fits(button, 56));
  await mini.evaluate(() => wx.pageScrollTo({ scrollTop: 100000, duration: 0 })); await shot('journey-preview-end');
  const end = await (await page.$('.submission-note')).offset(), dock = await (await page.$('.publish-dock')).offset();
  check('预览可滚动到正文与提示末尾，不被固定底栏遮挡', end.top + (await (await page.$('.submission-note')).size()).height <= dock.top + 1);
  page = await mini.switchTab('/pages/articles/index'); await wait(async () => (await page.data('cards')).length === 1);
  check('公开列表长标题与署名仍在内容边界内', await fits(await page.$('.public-card')));
  check('列表长标题最多三行，保留浏览节奏', (await (await page.$('.card-title')).size()).height <= 96);
  await page.setData({ cursor: 'qa-next-page' });
  check('分页入口铺满内容区且至少 56px', await fits(await page.$('.load-more'), 56) && (await (await page.$('.load-more')).size()).width >= info.windowWidth - 48);
  await shot('journey-public-list-long');
  page = await mini.navigateTo('/pages/article/index?id=qa-article'); await wait(async () => await page.data('shareReady'));
  await shot('journey-reader-long');
  await mini.evaluate(() => wx.pageScrollTo({ scrollTop: 100000, duration: 0 })); await shot('journey-reader-end');
  check('长文末尾分享操作完整且至少 56px', await fits(await page.$('.share-button'), 56));
  await (await page.$('.journey-header')).callMethod('back'); await wait(async () => (await mini.currentPage()).path === 'pages/articles/index');
  check('阅读返回原公共列表', (await mini.currentPage()).path === 'pages/articles/index');

  page = await mini.navigateTo('/pages/works/index?recycle=1'); await wait(async () => !await page.data('loading'));
  await page.setData({ cards: [{ id: 'qa-recycle', title: '用于回收站布局的较长文章标题，恢复和删除操作应各自清楚', meta: '2026-09-07 12:30 · 320 字', revision: 1, deleted: true, recovery: false, category: 'draft', publication: '草稿' }] });
  await page.callMethod('filterCards'); await shot('journey-recycle');
  for (const button of await page.$$('.work-actions button')) check('回收站长标题下恢复和永久删除可达', await fits(button));
  page = await mini.navigateTo('/pages/editor/index'); await wait(async () => !!await page.data('draft'));
  await page.callMethod('toggleInputMode');
  await shot('journey-editor');
  check('编辑下一步有明确宽度和 56px 高度', await fits(await page.$('.publication-next'), 56));
  check('小文辅助入口与下一步分开且不越界', await fits(await page.$('.xiaowen')));
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
