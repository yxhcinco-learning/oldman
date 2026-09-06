// @vitest-environment node
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { checkDocumentLinks, checkDocuments, localLinkTargets } from '../scripts/check-docs.mjs';

const read = (path: string) => readFileSync(path, 'utf8');
it('serves operations without the retired H5 entry or global theme', () => {
  expect(read('app/page.tsx')).toContain("redirect('/admin/topics')");
  expect(read('app/globals.css')).not.toMatch(/tailwindcss|phone-shell|chat-bubble|--forest/);
  expect(read('app/layout.tsx')).toContain('运营后台');
  expect(existsSync('features/writing/ProductApp.tsx')).toBe(false);
  expect(existsSync('archive/h5/features/writing/ProductApp.tsx')).toBe(true);
});

it('keeps temporary QA artifacts out of lint and TypeScript without excluding maintained scripts', async () => {
  const eslint = new ESLint();
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config;
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, process.cwd());
  for (const dir of ['.tmp', 'outputs', 'work', 'test-results']) {
    expect(config.exclude).toContain(dir);
    expect(await eslint.isPathIgnored(`${dir}/one-off-qa.ts`)).toBe(true);
    expect(parsed.fileNames.some(file => file.replaceAll('\\', '/').includes(`/${dir}/`))).toBe(false);
  }
  expect(await eslint.isPathIgnored('scripts/check-docs.mjs')).toBe(false);
  expect(parsed.fileNames.some(file => file.endsWith('server/index.ts'))).toBe(true);
});

it('keeps retired demo specifications in history and exposes the current handoff', () => {
  for (const name of ['isolated-ai-demo', 'isolated-design-preview']) {
    expect(existsSync(`openspec/specs/${name}/spec.md`)).toBe(false);
    expect(existsSync(`docs/archive/h5/specs/${name}/spec.md`)).toBe(true);
  }
  for (const path of ['README.md', 'AGENTS.md', 'openspec/config.yaml']) {
    expect(read(path)).toContain('docs/STATUS.md');
    expect(read(path)).not.toContain('新 AppID 待提供');
  }
  expect(read('openspec/README.md')).not.toContain('保持活跃');
  expect(checkDocuments().errors).toEqual([]);
});

it('extracts local Markdown links without treating external links or fenced examples as files', () => {
  expect(localLinkTargets('[状态](docs/STATUS.md#当前结论) [说明](<my%20file.md>) [站点](https://example.com) [锚](#a)\n```md\n[示例](missing.md)\n```'))
    .toEqual(['docs/STATUS.md', 'my file.md']);
});
it('excludes archived runtime from code checks and release archives', () => {
  expect(JSON.parse(read('tsconfig.json')).exclude).toContain('archive');
  expect(read('eslint.config.mjs')).toContain('archive/**');
  expect(read('vitest.config.ts')).toContain("include: ['tests/**/*.test.{ts,tsx}']");
  expect(read('.gitattributes')).toContain('archive/ export-ignore');
  const manifest = JSON.parse(read('package.json'));
  expect(manifest.dependencies.idb).toBeUndefined();
  expect(manifest.scripts['build:admin']).toBeTruthy();
  expect(manifest.scripts['build:web']).toBeUndefined();
});

it('checks historical document links without requiring retired code or screenshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'suiyue-doc-links-'));
  try {
    writeFileSync(join(root, 'evidence.md'), '[有效](target.md#section) [已移走](missing.md) [截图](old.png) [源码](old.ts)');
    writeFileSync(join(root, 'target.md'), '# 已归档原文');
    expect(checkDocumentLinks(root, 'evidence.md', { markdownOnly: true }))
      .toEqual(['文档引用失效: evidence.md -> missing.md']);
    expect(checkDocumentLinks(root, 'evidence.md')).toHaveLength(3);
    expect(checkDocumentLinks(root, 'absent.md')).toEqual(['文档不存在: absent.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('keeps stage evidence archived and removes redundant root redirects', () => {
  expect(checkDocuments().archiveCount).toBeGreaterThan(0);
  expect(existsSync('docs/CLIENT-SCOPE.md')).toBe(false);
  expect(existsSync('docs/XIAOWEN-FLOW-REVIEW.md')).toBe(false);
  expect(existsSync('docs/archive/phase-one/XIAOWEN-FLOW-REVIEW.md')).toBe(true);
  expect(read('docs/PRODUCT.md')).toContain('## 维护范围');
  expect(read('docs/ARCHITECTURE.md')).toContain('三个独立状态');
});
