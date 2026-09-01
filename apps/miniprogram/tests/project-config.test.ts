import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { completeVoice, emptyDraft, workFromDraft } from '../miniprogram/domain/core';
import { assertDevtoolCoreRuntime } from '../scripts/devtool-runtime-check.mjs';

const readJson = (relative: string) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as Record<string, unknown>;
const readText = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('微信小程序公共工程配置', () => {
  it('不提交真实 AppID，并启用 TypeScript 编译', () => {
    const project = readJson('../project.config.json');
    const setting = project.setting as Record<string, unknown>;
    expect(project.appid).toBe('touristappid');
    expect(setting.useCompilerPlugins).toEqual(['typescript']);
  });

  it('声明三个可直接打开的主页面', () => {
    const app = readJson('../miniprogram/app.json');
    const tabBar = app.tabBar as { custom: boolean; list: Array<{ pagePath: string; text: string }> };
    expect(app.pages).toEqual(expect.arrayContaining(['pages/home/index', 'pages/works/index', 'pages/profile/index', 'pages/editor/index']));
    expect(tabBar.custom).toBe(true);
    expect(tabBar.list).toEqual([
      { pagePath: 'pages/home/index', text: '热门' },
      { pagePath: 'pages/works/index', text: '文章' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ]);
    expect(app.requiredPrivateInfos).toBeUndefined();
    expect(app.permission).toBeUndefined();
  });

  it('通过小程序适配入口复用写作语义', () => {
    const draft = completeVoice({ ...emptyDraft(), pendingVoice: '从前的故事。' });
    const work = workFromDraft(draft);
    expect(work.draft.segments[0]?.text).toBe('从前的故事。');
    expect(work.title).toBe('未命名作品');
  });

  it('在开发者工具二次构建后校验实际共享包导出', () => {
    const packageJson = readJson('../package.json');
    const prepareScript = readText('../scripts/prepare-devtool-npm.mjs');
    const buildScript = readText('../scripts/build-devtool-npm.mjs');
    expect(packageJson.scripts).toMatchObject({ 'devtool:build-npm': 'node scripts/build-devtool-npm.mjs' });
    expect(prepareScript).not.toContain('generatedCoreTarget');
    expect(buildScript).toContain('await rm(generatedCoreTarget');
    expect(() => assertDevtoolCoreRuntime({ workFromDraft() {}, isWorkAiAssisted() {}, AI_ASSISTANCE_LABEL: 'AI' })).not.toThrow();
    expect(() => assertDevtoolCoreRuntime({ workFromDraft() {} })).toThrow(/isWorkAiAssisted/);
  });

  it('保留三栏主导航、键盘避让和生命周期保存边界', () => {
    const navigationConfig = readJson('../miniprogram/custom-tab-bar/index.json');
    const navigation = readText('../miniprogram/custom-tab-bar/index.wxml');
    const navigationStyles = readText('../miniprogram/custom-tab-bar/index.wxss');
    const brandStyles = readText('../miniprogram/components/app-brand/index.wxss');
    const navigationController = readText('../miniprogram/custom-tab-bar/index.ts');
    const tabSelection = readText('../miniprogram/ui/tab-bar.ts');
    const homeConfig = readText('../miniprogram/pages/home/index.json');
    const home = readText('../miniprogram/pages/home/index.wxml');
    const homeController = readText('../miniprogram/pages/home/index.ts');
    const topicDetail = readText('../miniprogram/pages/topic-detail/index.wxml');
    const topicDetailStyles = readText('../miniprogram/pages/topic-detail/index.wxss');
    const editor = readText('../miniprogram/pages/editor/index.wxml');
    const editorStyles = readText('../miniprogram/pages/editor/index.wxss');
    const editorController = readText('../miniprogram/pages/editor/index.ts');
    const works = readText('../miniprogram/pages/works/index.wxml');
    const worksStyles = readText('../miniprogram/pages/works/index.wxss');
    const worksController = readText('../miniprogram/pages/works/index.ts');

    expect(navigationConfig.component).toBe(true);
    expect(navigation).toContain('wx:for="{{list}}"');
    expect(navigation).toContain('bindtap="switchTab"');
    expect(works).toContain('bindtap="startWriting"');
    expect(navigationStyles).toContain('repeat(3, minmax(0, 1fr))');
    expect(navigationStyles).toMatch(/\.tab-bar\s*\{[^}]*position:\s*fixed/);
    expect(navigationStyles).toMatch(/\.tab-bar\s*\{[^}]*right:\s*0[^}]*left:\s*0[^}]*box-sizing:\s*border-box/);
    expect(navigationStyles).toMatch(/\.tabs\s*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/);
    expect(navigationStyles).toMatch(/\.tab-bar\s*\{[^}]*height:\s*calc\(72px/);
    expect(navigationStyles).toMatch(/:host\s*\{[^}]*height:\s*0/);
    expect(navigationStyles).toMatch(/\.tab\s*\{[^}]*min-height:\s*60px/);
    expect(navigationStyles).toContain('.tab.active .icon-wrap');
    expect(brandStyles).toMatch(/:host\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/);
    expect(navigationController).toContain('wx.showToast');
    expect(navigationController).toContain('wx.switchTab');
    expect(tabSelection).toContain('getTabBar');
    expect(homeConfig).not.toContain('app-nav');
    expect(home).not.toContain('<app-nav');
    expect(homeController).toContain('selectTab(this, 0)');
    expect(topicDetail).toContain('class="detail-brand"');
    expect(topicDetail).not.toContain('padding-right: {{menuReserve}}px');
    expect(topicDetailStyles).toMatch(/\.detail-topbar\s*\{[^}]*margin-right:\s*-24px/);
    expect(topicDetailStyles).toMatch(/\.detail-topbar\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/);
    expect(topicDetailStyles).toMatch(/\.detail-brand\s*\{[^}]*position:\s*absolute[^}]*right:\s*64px[^}]*left:\s*64px/);
    expect(topicDetailStyles).toMatch(/\.start-actions\s*\{[^}]*overflow:\s*hidden/);
    expect(topicDetailStyles).toMatch(/\.start-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(topicDetailStyles).toMatch(/\.start-actions button\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*box-sizing:\s*border-box/);
    expect(worksController).toContain('selectTab(this, 1)');
    expect(editor).toContain('bindkeyboardheightchange="onKeyboardHeight"');
    expect(editor).not.toContain('<view class="save"');
    expect(editor).toContain('<view class="topbar-spacer"></view>');
    expect(editor).toContain('正在自动保存');
    expect(editorStyles).toContain('env(safe-area-inset-bottom)');
    expect(editorStyles).toContain('grid-template-columns: 48px minmax(0, 1fr) 48px');
    expect(editorStyles).toContain('.voice-side-slot');
    expect(editorStyles).toMatch(/button\.mic\s*\{[^}]*max-width:\s*76px/);
    expect(editorController).toContain('onHide()');
    expect(editorController).toContain('onUnload()');
    expect(editorController).toContain('lifecycleSavePending');
    expect(editorController).toContain('await this.flushAutoSave()');
    expect(editorController).toContain('if (!saved) return');
    expect(editorController).toContain('savingVersion === draftVersion');
    expect(worksController).toContain('await miniServices().writer.flush()');
    expect(worksStyles).toMatch(/\.create-dock\s*\{[^}]*right:\s*0[^}]*left:\s*0[^}]*box-sizing:\s*border-box[^}]*overflow:\s*hidden/);
    expect(worksStyles).toMatch(/\.create-button\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/);
  });

  it('明确说明作品的设备和 AppID 隔离边界', () => {
    const profile = readText('../miniprogram/pages/profile/index.wxml');
    expect(profile).toContain('只保存在本机');
    expect(profile).toContain('当前小程序 AppID');
    expect(profile).toContain('请定期手工导出备份');
    expect(profile).toContain('不请求手机号、头像或昵称');
    expect(profile).toContain('发送 DeepSeek');
  });

  it('正文、小文和采访都使用长按语音且不保留旧的不可用占位入口', () => {
    const editor = readText('../miniprogram/pages/editor/index.wxml');
    const editorController = readText('../miniprogram/pages/editor/index.ts');
    const interview = readText('../miniprogram/pages/interview/index.wxml');
    for (const source of [editor, interview]) {
      expect(source).toContain('bindtouchstart=');
      expect(source).toContain('bindtouchend=');
      expect(source).toContain('bindtouchcancel=');
      expect(source).not.toContain('dictateUnavailable');
      expect(source).not.toContain('voiceUnavailable');
    }
    expect(editor).toContain('不会发送给小文');
    expect(editorController).toContain('AI_ASSISTANCE_LABEL');
    expect(editor).toContain('确认应用前不会进入正文');
  });
});
