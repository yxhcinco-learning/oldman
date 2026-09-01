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
    expect(app.pages).toEqual(expect.arrayContaining(['pages/home/index', 'pages/works/index', 'pages/profile/index', 'pages/editor/index']));
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
    expect(packageJson.scripts).toMatchObject({ 'devtool:build-npm': 'node scripts/build-devtool-npm.mjs' });
    expect(prepareScript).toContain('await rm(generatedCoreTarget');
    expect(() => assertDevtoolCoreRuntime({ workFromDraft() {}, isWorkAiAssisted() {}, AI_ASSISTANCE_LABEL: 'AI' })).not.toThrow();
    expect(() => assertDevtoolCoreRuntime({ workFromDraft() {} })).toThrow(/isWorkAiAssisted/);
  });

  it('保留三栏主导航、键盘避让和生命周期保存边界', () => {
    const navigation = readText('../miniprogram/components/app-nav/index.wxml');
    const navigationStyles = readText('../miniprogram/components/app-nav/index.wxss');
    const navigationController = readText('../miniprogram/components/app-nav/index.ts');
    const editor = readText('../miniprogram/pages/editor/index.wxml');
    const editorStyles = readText('../miniprogram/pages/editor/index.wxss');
    const editorController = readText('../miniprogram/pages/editor/index.ts');
    const works = readText('../miniprogram/pages/works/index.wxml');
    const worksController = readText('../miniprogram/pages/works/index.ts');

    expect(navigation.match(/bindtap="navigate"/g)).toHaveLength(3);
    expect(works).toContain('bindtap="startWriting"');
    expect(navigationStyles).toContain('repeat(3, minmax(0, 1fr))');
    expect(navigationStyles).toMatch(/\.nav-shell\s*\{[^}]*position:\s*fixed/);
    expect(navigationStyles).toMatch(/\.nav-shell\s*\{[^}]*height:\s*calc\(72px/);
    expect(navigationStyles).toMatch(/:host\s*\{[^}]*height:\s*0/);
    expect(navigationStyles).toMatch(/\.tab\s*\{[^}]*min-height:\s*60px/);
    expect(navigationStyles).toContain('.tab.active .icon-wrap');
    expect(navigationController).toContain('wx.showToast');
    expect(navigationController).toContain('wx.reLaunch');
    expect(editor).toContain('bindkeyboardheightchange="onKeyboardHeight"');
    expect(editorStyles).toContain('env(safe-area-inset-bottom)');
    expect(editorStyles).toContain('.voice-side-slot');
    expect(editorStyles).toMatch(/button\.mic\s*\{[^}]*max-width:\s*76px/);
    expect(editorController).toContain('onHide()');
    expect(editorController).toContain('onUnload()');
    expect(editorController).toContain('lifecycleSavePending');
    expect(editorController).toContain('this.data.saved && !this.data.saving');
    expect(worksController).toContain('await miniServices().writer.flush()');
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
