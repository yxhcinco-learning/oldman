import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dependencyRoot = resolve(appRoot, 'node_modules');
const coreTarget = resolve(dependencyRoot, '@suiyue', 'core');
const generatedNpmRoot = resolve(appRoot, 'miniprogram', 'miniprogram_npm');
const generatedCoreTarget = resolve(generatedNpmRoot, '@suiyue', 'core');

const assertChildPath = (parent, target) => {
  const child = relative(parent, target);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('拒绝清理小程序依赖目录之外的路径');
};

assertChildPath(dependencyRoot, coreTarget);
assertChildPath(generatedNpmRoot, generatedCoreTarget);
await rm(coreTarget, { recursive: true, force: true });
// 微信开发者工具会按包版本复用 miniprogram_npm。先移除旧包，避免源码已更新但运行时仍加载旧导出。
await rm(generatedCoreTarget, { recursive: true, force: true });
await mkdir(coreTarget, { recursive: true });

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    emptyOutDir: false,
    lib: { entry: resolve(repoRoot, 'packages', 'core', 'src', 'index.ts'), formats: ['cjs'], fileName: () => 'index.js' },
    minify: true,
    outDir: coreTarget,
    target: 'es2017',
  },
});

const sourcePackage = JSON.parse(await readFile(resolve(repoRoot, 'packages', 'core', 'package.json'), 'utf8'));
const packageJson = { name: sourcePackage.name, version: sourcePackage.version, private: true, main: './index' };
await writeFile(resolve(coreTarget, 'package.json'), JSON.stringify(packageJson, null, 2));

console.info('微信开发者工具 npm 依赖已准备（单文件 @suiyue/core，旧运行产物已清理）');
