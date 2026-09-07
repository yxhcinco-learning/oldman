import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { assertDevtoolCoreRuntime } from './devtool-runtime-check.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const dependencyRoot = resolve(appRoot, 'node_modules');
const coreTarget = resolve(dependencyRoot, '@suiyue', 'core');

const assertChildPath = (parent, target) => {
  const child = relative(parent, target);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('拒绝清理小程序依赖目录之外的路径');
};

assertChildPath(dependencyRoot, coreTarget);
await rm(coreTarget, { recursive: true, force: true });
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
const bundled = await readFile(resolve(coreTarget, 'index.js'), 'utf8');
const runtime = { exports: {} };
runInNewContext(bundled, { module: runtime, exports: runtime.exports }, { timeout: 5000 });
assertDevtoolCoreRuntime(runtime.exports);
// DevTools caches packages by version: a source-only update must change that key.
const fingerprint = createHash('sha256').update(bundled).digest('hex').slice(0, 16);
// The IDE also caches compiled npm module IDs by entry path, independently of
// package version. A content-addressed entry invalidates that cache without
// clearing the user's account, work files or simulator storage.
const entryName = `index-${fingerprint}.js`;
await writeFile(resolve(coreTarget, entryName), bundled);
const packageJson = { name: sourcePackage.name, version: `${sourcePackage.version}-mini.h${fingerprint}`, private: true, main: './' + entryName };
await writeFile(resolve(coreTarget, 'package.json'), JSON.stringify(packageJson, null, 2));

console.info('微信开发者工具 npm 源依赖已准备（单文件 @suiyue/core）');
