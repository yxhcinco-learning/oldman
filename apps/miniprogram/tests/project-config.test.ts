import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { completeVoice, emptyDraft, workFromDraft } from '../miniprogram/domain/core';

const readJson = (relative: string) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as Record<string, unknown>;

describe('微信小程序公共工程配置', () => {
  it('不提交真实 AppID，并启用 TypeScript 编译', () => {
    const project = readJson('../project.config.json');
    const setting = project.setting as Record<string, unknown>;
    expect(project.appid).toBe('touristappid');
    expect(setting.useCompilerPlugins).toEqual(['typescript']);
  });

  it('声明三个可直接打开的主页面', () => {
    const app = readJson('../miniprogram/app.json');
    expect(app.pages).toEqual(['pages/home/index', 'pages/works/index', 'pages/profile/index']);
  });

  it('通过小程序适配入口复用写作语义', () => {
    const draft = completeVoice({ ...emptyDraft(), pendingVoice: '从前的故事。' });
    const work = workFromDraft(draft);
    expect(work.draft.segments[0]?.text).toBe('从前的故事。');
    expect(work.title).toBe('未命名作品');
  });
});
