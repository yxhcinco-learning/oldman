import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.PLAYWRIGHT_PATH || !process.env.SUIYUE_PUBLICATION_QA_OUTPUT) throw new Error('请指定 Playwright 和独立 QA 输出目录。');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH);
const output = resolve(process.env.SUIYUE_PUBLICATION_QA_OUTPUT); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const passed = [], errors = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:3811/admin/topics');
  await page.getByLabel('用户名').fill('reviewer'); await page.getByLabel('密码').fill('local-publication-qa-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '文章审核', exact: true }).click();
  const titles = ['老街的清晨', '回家的那班慢车', '一碗热汤的记忆'];
  for (const [index, viewport] of [{ width: 1280, height: 900 }, { width: 1440, height: 900 }, { width: 390, height: 844 }].entries()) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: new RegExp(titles[index]) }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '列表不能横向溢出');
    await page.screenshot({ path: resolve(output, `admin-list-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: new RegExp(titles[index]) }).click();
    await page.getByRole('heading', { name: titles[index] }).waitFor();
    await page.locator('img[alt="投稿封面"]').evaluate(image => image.decode());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '预览不能横向溢出');
    const cover = await page.locator('img[alt="投稿封面"]').boundingBox();
    assert.ok(Math.abs(cover.width / cover.height - 1.25) < .01, '后台图片显示 5:4');
    assert.ok(!(await page.locator('body').textContent()).includes('未投稿会话仅私有'), '后台不显示私有会话');
    await page.screenshot({ path: resolve(output, `admin-preview-${viewport.width}.png`), fullPage: true });
    if (index === 1) {
      await page.getByRole('button', { name: '驳回', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '请填写简短原因' }).waitFor();
      await page.getByLabel('驳回或下架原因').fill('请确认公开内容');
      await page.getByRole('button', { name: '驳回', exact: true }).click();
      await page.getByText('已驳回，原因已反馈给作者。').waitFor();
    } else {
      await page.getByRole('button', { name: '通过审核', exact: true }).click();
      await page.getByText('已通过审核，文章现在可供登录用户阅读。').waitFor();
    }
    passed.push(`${viewport.width}×${viewport.height} 列表、完整预览、图片比例和实际审核请求`);
  }
  await page.getByRole('tab', { name: '已发表', exact: true }).click();
  await page.getByRole('button', { name: /老街的清晨/ }).click();
  await page.getByLabel('驳回或下架原因').fill('本地验收下架');
  await page.getByRole('button', { name: '下架文章并取消待审稿' }).click();
  await page.getByText('已下架，现有待审核稿也已取消。').waitFor();
  passed.push('驳回原因校验、已发表列表和实际下架请求');
  assert.deepEqual(errors, [], '页面无运行时错误');
  await writeFile(resolve(output, 'admin-report.json'), JSON.stringify({ passed, errors }, null, 2));
  console.info(JSON.stringify({ passed, errors }));
} finally { await browser.close(); }
