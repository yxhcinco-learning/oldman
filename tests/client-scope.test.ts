// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { checkDocuments, localLinkTargets } from '../scripts/check-docs.mjs';

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
it('excludes the archive from checks and release archives', () => {
  expect(JSON.parse(read('tsconfig.json')).exclude).toContain('archive');
  expect(read('eslint.config.mjs')).toContain('archive/**');
  expect(read('vitest.config.ts')).toContain("include: ['tests/**/*.test.{ts,tsx}']");
  expect(read('.gitattributes')).toContain('archive/ export-ignore');
  const manifest = JSON.parse(read('package.json'));
  expect(manifest.dependencies.idb).toBeUndefined();
  expect(manifest.scripts['build:admin']).toBeTruthy();
  expect(manifest.scripts['build:web']).toBeUndefined();
});
