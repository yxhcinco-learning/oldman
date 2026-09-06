import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, relative } from 'node:path';

let errors = 0;
const report = text => { console.error(text); errors++; };
async function scan(dir) {
  dir = dir.replaceAll('\\', '/');
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) { await scan(path); continue; }
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const imported = (specifier.startsWith('@/') ? resolve(specifier.slice(2)) : resolve(dirname(path), specifier)).replaceAll('\\', '/');
      const target = relative(process.cwd(), imported).replaceAll('\\', '/');
      if (/^(?:archive|lib|components|previews)\//.test(target) || /^features\/(?!topic-admin\/)/.test(target)) report(`活跃代码依赖退役 H5: ${path}`);
    }
    if ((dir.startsWith('app') || dir.startsWith('features') || dir.startsWith('lib')) && /process\.env\.(?:TENCENT|DEEPSEEK)|TENCENT_ASR_SECRET_KEY|DEEPSEEK_API_KEY/.test(source)) report(`客户端出现服务端凭据引用: ${path}`);
    if ((dir.startsWith('app') || dir.startsWith('features') || dir.startsWith('lib')) && /from\s+['"][^'"]*server\//.test(source)) report(`客户端导入服务端模块: ${path}`);
    if (!dir.startsWith('features/demo') && /from\s+['"][^'"]*mock-data/.test(source)) report(`真实业务依赖演示数据: ${path}`);
    if (dir.startsWith('packages/core/src') && /(?:from\s+['"](?:react|react-dom|node:)|\b(?:window|document|localStorage|indexedDB|process|wx)\b)/.test(source)) {
      report(`共享核心依赖平台专属 API: ${path}`);
    }
    if (dir.startsWith('apps/miniprogram/miniprogram') && /(?:from\s+['"](?:node:|[^'"]*server\/)|\bprocess\.env\b|WECHAT_MINIPROGRAM_APP_SECRET|TENCENT_ASR_SECRET_KEY|DEEPSEEK_API_KEY)/.test(source)) {
      report(`小程序客户端越过平台或密钥边界: ${path}`);
    }
  }
}
for (const dir of ['app', 'features', 'server', 'tests', 'scripts', 'packages/core/src', 'apps/miniprogram/miniprogram']) await scan(dir);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  if (/(^|\/)(node_modules|dist|\.wrangler|backups|miniprogram_npm|preview|upload|\.wechat-devtools)\//.test(file) ||
    /(^|\/)project\.private\.config\.json$/.test(file) || /(^|\/)\.env(\.|$)/.test(file) && file !== '.env.example' ||
    /\.(wav|pcm|webm)$/.test(file)) report(`敏感或生成文件被跟踪: ${file}`);
  if (/\.(?:png|jpg|jpeg|gif|ico)$/.test(file)) continue;
  try {
    const source = await readFile(file, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKID[A-Za-z0-9]{28,}|gh[pousr]_[A-Za-z0-9]{30,}/.test(source)) report(`疑似密钥: ${file}`);
  } catch { /* A tracked file may have just been removed in the current change. */ }
}
if (errors) process.exit(1);
console.info('模块边界与已跟踪文件检查通过（不替代人工敏感信息审查）');
