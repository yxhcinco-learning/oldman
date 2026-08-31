import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const project = JSON.parse(await readFile(new URL('project.config.json', root), 'utf8'));
const app = JSON.parse(await readFile(new URL('miniprogram/app.json', root), 'utf8'));

if (project.appid !== 'touristappid') throw new Error('公共 project.config.json 只能使用 touristappid');
if (project.miniprogramRoot !== 'miniprogram/') throw new Error('miniprogramRoot 配置无效');
if (!Array.isArray(app.pages) || app.pages.length < 3) throw new Error('至少需要三个主页面');

for (const page of app.pages) {
  for (const suffix of ['.ts', '.json', '.wxml', '.wxss']) {
    await access(join(fileURLToPath(new URL('miniprogram/', root)), `${page}${suffix}`));
  }
}

console.info(`小程序工程检查通过（${app.pages.length} 个页面）`);
