import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (!process.env.PLAYWRIGHT_PATH || !process.env.SUIYUE_SOCIAL_QA_OUTPUT) throw new Error('请指定 Playwright 和独立 QA 输出目录。');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH);
const output = resolve(process.env.SUIYUE_SOCIAL_QA_OUTPUT); await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(resolve(output, 'fixture.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const passed = [], errors = [], external = [];
const origin = 'http://localhost:3813';
try {
  const context = await browser.newContext(); const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/)) external.push(request.url()); });
  const navigate = async name => {
    if (await page.getByRole('button', { name: '打开导航' }).isVisible()) await page.getByRole('button', { name: '打开导航' }).click();
    await page.getByRole('navigation', { name: '后台栏目' }).getByRole('button', { name, exact: true }).click();
  };
  const noOverflow = async label => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label); passed.push(label); };
  const capture = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: resolve(output, name), fullPage: true, animations: 'disabled' }); };
  await page.goto(origin + '/admin/topics');
  await page.getByLabel('用户名').fill('reviewer'); await page.getByLabel('密码').fill('local-social-qa-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await navigate('评论审核');
  for (const [index, viewport] of [{ width: 1280, height: 900 }, { width: 1440, height: 900 }, { width: 390, height: 844 }].entries()) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: new RegExp(fixture.comments[index].text) }).waitFor();
    await noOverflow(`${viewport.width} 评论队列无横向溢出`);
    await capture(`comments-${viewport.width}.png`);
    await page.getByRole('button', { name: new RegExp(fixture.comments[index].text) }).click();
    await page.getByRole('article', { name: '评论详情' }).waitFor();
    await noOverflow(`${viewport.width} 评论详情无横向溢出`);
    assert.ok(!(await page.locator('body').textContent()).includes('不可公开的私有会话'));
    const button = await page.getByRole('button', { name: '通过评论' }).boundingBox(); assert.ok(button.height >= 44);
    await capture(`comment-detail-${viewport.width}.png`);
    if (index === 1) {
      await page.getByRole('button', { name: '驳回评论' }).click(); await page.getByRole('alert').filter({ hasText: '请填写驳回或隐藏原因' }).waitFor();
      await page.getByLabel('驳回或隐藏原因').fill('请核对地名'); await page.getByRole('button', { name: '驳回评论' }).click(); await page.getByText('评论已驳回。').waitFor();
    } else { await page.getByRole('button', { name: '通过评论' }).click(); await page.getByText('评论已通过审核。').waitFor(); }
    passed.push(`${viewport.width} 真实 HTTP/SQLite 审核与原因校验`);
  }
  await navigate('举报处理');
  await page.getByRole('button', { name: /请核对这条评论/ }).click(); await page.getByRole('region', { name: '举报详情' }).waitFor();
  await page.getByRole('button', { name: '标记已处理' }).click(); await page.getByRole('alert').filter({ hasText: '请填写举报处理结论' }).waitFor();
  for (const width of [390, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 }); await noOverflow(`${width} 举报详情无横向溢出`);
    await capture(`report-detail-${width}.png`);
  }
  await page.getByLabel('驳回或隐藏原因').fill('本地验收：停止展示'); await page.getByRole('button', { name: '隐藏评论' }).click();
  await page.getByText('评论已隐藏，读者不再可见。').waitFor();
  assert.equal(await page.getByRole('button', { name: '标记已处理' }).count(), 1, '隐藏不会自动处理举报');
  await page.getByLabel('举报处理结论').fill('已核实并隐藏评论'); await page.getByRole('button', { name: '标记已处理' }).click();
  await page.getByText('举报已处理，结论已记录。').waitFor();
  await page.getByRole('tab', { name: '已处理' }).click(); await page.getByRole('button', { name: /请核对这条评论/ }).click();
  await page.getByText('处理结论：已核实并隐藏评论').waitFor(); await page.getByText('处理举报', { exact: true }).waitFor();
  passed.push('举报显式隐藏、独立处理结论、管理员审计回看');
  await navigate('评论审核');
  await page.getByRole('button', { name: /并发审核专用评论/ }).click(); await page.getByRole('article', { name: '评论详情' }).waitFor();
  const session = await (await context.request.get(origin + '/api/admin/auth/session')).json();
  const concurrentId = fixture.comments[4].id;
  const concurrent = await (await context.request.get(origin + `/api/admin/comments/${concurrentId}`)).json();
  const changed = await context.request.post(origin + `/api/admin/comments/${concurrentId}/actions`, { headers: { origin, 'x-csrf-token': session.csrfToken }, data: { operationId: randomUUID(), expectedVersion: concurrent.version, action: 'reject', reason: '另一个管理员先处理' } });
  assert.equal(changed.status(), 200);
  await page.getByRole('button', { name: '通过评论' }).click(); await page.getByRole('alert').filter({ hasText: '评论或举报状态已变化' }).waitFor();
  assert.equal(await page.getByRole('article', { name: '评论详情' }).count(), 0); passed.push('真实并发审核版本冲突关闭旧详情');
  const lostId = fixture.comments[5].id;
  await page.getByRole('button', { name: /未知结果专用评论/ }).click(); await page.getByRole('article', { name: '评论详情' }).waitFor();
  const lostUrl = origin + `/api/admin/comments/${lostId}/actions`; let lostOnce = false;
  await page.route(lostUrl, async route => {
    if (lostOnce) return route.continue(); lostOnce = true;
    const committed = await route.fetch(); assert.equal(committed.status(), 200); await route.abort('failed');
  });
  await page.getByRole('button', { name: '通过评论' }).click(); await page.getByRole('button', { name: '重试原操作' }).click();
  await page.getByText('评论已通过审核。').waitFor(); await page.unroute(lostUrl);
  const audit = await (await context.request.get(origin + `/api/admin/comments/${lostId}/audit`)).json();
  assert.equal(audit.entries.filter(item => item.action === 'approve').length, 1); passed.push('已提交后响应丢失，重试不重复审核或审计');
  const withoutCsrf = await context.request.post(origin + `/api/admin/comments/${lostId}/actions`, { headers: { origin }, data: { operationId: randomUUID(), expectedVersion: 2, action: 'hide', reason: '不得执行' } });
  assert.equal(withoutCsrf.status(), 403);
  const cookie = (await context.cookies(origin)).map(item => `${item.name}=${item.value}`).join('; ');
  // Bypass the dev proxy's own Origin block to verify the gateway guard itself.
  const foreignOrigin = await context.request.post(`http://127.0.0.1:3814/api/admin/comments/${lostId}/actions`, { headers: { origin: 'https://invalid.example', cookie, 'x-csrf-token': session.csrfToken }, data: { operationId: randomUUID(), expectedVersion: 2, action: 'hide', reason: '不得执行' } });
  assert.equal(foreignOrigin.status(), 403);
  const anonymous = await browser.newContext(); const unauthorized = await anonymous.request.get(origin + '/api/admin/comments?state=pending'); assert.equal(unauthorized.status(), 401); await anonymous.close();
  passed.push('实际管理员鉴权、缺失 CSRF 和非本站 Origin 均拒绝');
  await navigate('运行监控'); await page.getByRole('heading', { name: '读者互动汇总' }).waitFor();
  for (const width of [390, 1280, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(`${width} 转化汇总无横向溢出`); }
  await capture('social-metrics-1440.png');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(resolve(output, 'admin-report.json'), JSON.stringify({ passed, errors, external, evidence: '真实浏览器/HTTP/SQLite；微信换码替身；丢失响应由拦截器模拟，不使用真实账号。' }, null, 2));
  console.info(JSON.stringify({ passed, errors, external }));
} finally { await browser.close(); }
