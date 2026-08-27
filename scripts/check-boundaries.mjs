import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

let errors = 0;
const report = text => { console.error(text); errors++; };
async function scan(dir) {
  dir = dir.replaceAll('\\', '/');
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) { await scan(path); continue; }
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const source = await readFile(path, 'utf8');
    if (dir.startsWith('features/demo') && /from\s+['"][^'"]*(?:lib\/storage|server\/|features\/speech)/.test(source)) report(`演示不能调用真实服务: ${path}`);
    if ((dir.startsWith('app') || dir.startsWith('features')) && /process\.env\.TENCENT|TENCENT_ASR_SECRET_KEY/.test(source)) report(`客户端出现服务端凭据引用: ${path}`);
    if (!dir.startsWith('features/demo') && /from\s+['"][^'"]*mock-data/.test(source)) report(`真实业务依赖演示数据: ${path}`);
  }
}
for (const dir of ['app', 'features', 'lib', 'server']) await scan(dir);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  if (/(^|\/)(node_modules|dist|\.wrangler|backups)\//.test(file) || /(^|\/)\.env(\.|$)/.test(file) && file !== '.env.example' || /\.(wav|pcm|webm)$/.test(file)) report(`敏感或生成文件被跟踪: ${file}`);
  if (/\.(?:png|jpg|jpeg|gif|ico)$/.test(file)) continue;
  try {
    const source = await readFile(file, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKID[A-Za-z0-9]{28,}|gh[pousr]_[A-Za-z0-9]{30,}/.test(source)) report(`疑似密钥: ${file}`);
  } catch { /* A tracked file may have just been removed in the current change. */ }
}
if (errors) process.exit(1);
console.info('模块边界与已跟踪文件检查通过（不替代人工敏感信息审查）');
