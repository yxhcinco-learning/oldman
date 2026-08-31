import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { completeVoice, emptyDraft, workFromDraft } from '../miniprogram/domain/core';

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
  });

  it('通过小程序适配入口复用写作语义', () => {
    const draft = completeVoice({ ...emptyDraft(), pendingVoice: '从前的故事。' });
    const work = workFromDraft(draft);
    expect(work.draft.segments[0]?.text).toBe('从前的故事。');
    expect(work.title).toBe('未命名作品');
  });

  it('保留三栏主导航、键盘避让和生命周期保存边界', () => {
    const navigation = readText('../miniprogram/components/app-nav/index.wxml');
    const navigationStyles = readText('../miniprogram/components/app-nav/index.wxss');
    const editor = readText('../miniprogram/pages/editor/index.wxml');
    const editorStyles = readText('../miniprogram/pages/editor/index.wxss');
    const editorController = readText('../miniprogram/pages/editor/index.ts');

    expect(navigation.match(/data-target=/g)).toHaveLength(3);
    expect(navigationStyles).toContain('repeat(3, minmax(0, 1fr))');
    expect(editor).toContain('bindkeyboardheightchange="onKeyboardHeight"');
    expect(editorStyles).toContain('env(safe-area-inset-bottom)');
    expect(editorController).toContain('onHide()');
    expect(editorController).toContain('onUnload()');
  });

  it('明确说明作品的设备和 AppID 隔离边界', () => {
    const profile = readText('../miniprogram/pages/profile/index.wxml');
    expect(profile).toContain('只保存在本机');
    expect(profile).toContain('当前小程序 AppID');
    expect(profile).toContain('请定期手工导出备份');
  });

  it('正文、小文和采访都使用长按语音且不保留旧的不可用占位入口', () => {
    const editor = readText('../miniprogram/pages/editor/index.wxml');
    const interview = readText('../miniprogram/pages/interview/index.wxml');
    for (const source of [editor, interview]) {
      expect(source).toContain('bindtouchstart=');
      expect(source).toContain('bindtouchend=');
      expect(source).toContain('bindtouchcancel=');
      expect(source).not.toContain('dictateUnavailable');
      expect(source).not.toContain('voiceUnavailable');
    }
    expect(editor).toContain('不会发送给小文');
  });
});
