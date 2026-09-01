import { access, readFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { assertDevtoolCoreRuntime } from './devtool-runtime-check.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedNpmRoot = resolve(appRoot, 'miniprogram', 'miniprogram_npm');
const generatedCoreTarget = resolve(generatedNpmRoot, '@suiyue', 'core');

const generatedChild = relative(generatedNpmRoot, generatedCoreTarget);
if (!generatedChild || generatedChild.startsWith('..') || isAbsolute(generatedChild)) {
  throw new Error('拒绝清理小程序运行依赖目录之外的路径');
}

// 只有显式二次构建才清除可能被开发者工具缓存的旧运行包；普通根构建不得让已打开的小程序白屏。
await rm(generatedCoreTarget, { recursive: true, force: true });
await import('./prepare-devtool-npm.mjs');

const candidates = [
  process.env.WECHAT_DEVTOOLS_CLI_PATH,
  process.platform === 'win32'
    ? resolve(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Tencent', '微信web开发者工具', 'cli.bat')
    : undefined,
  process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli' : undefined,
].filter(Boolean);

let cliPath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    cliPath = candidate;
    break;
  } catch {
    // 继续查找本机候选路径。
  }
}

if (!cliPath) {
  throw new Error('未找到微信开发者工具 CLI；可通过 WECHAT_DEVTOOLS_CLI_PATH 指定 cli/cli.bat 的绝对路径');
}

const cli = process.platform === 'win32' ? 'powershell.exe' : cliPath;
const args = process.platform === 'win32'
  ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '& $env:SUIYUE_DEVTOOL_CLI build-npm --project $env:SUIYUE_DEVTOOL_PROJECT']
  : ['build-npm', '--project', appRoot];
const result = spawnSync(cli, args, {
  stdio: 'inherit',
  env: process.platform === 'win32'
    ? { ...process.env, SUIYUE_DEVTOOL_CLI: cliPath, SUIYUE_DEVTOOL_PROJECT: appRoot }
    : process.env,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`微信开发者工具构建 npm 失败（退出码 ${String(result.status)}）`);

const generatedEntry = resolve(appRoot, 'miniprogram', 'miniprogram_npm', '@suiyue', 'core', 'index.js');
const runtimeModule = { exports: {} };
runInNewContext(await readFile(generatedEntry, 'utf8'), { module: runtimeModule, exports: runtimeModule.exports }, {
  filename: generatedEntry,
  timeout: 5_000,
});
assertDevtoolCoreRuntime(runtimeModule.exports);

console.info('微信开发者工具 npm 运行产物已刷新并通过共享导出校验');
