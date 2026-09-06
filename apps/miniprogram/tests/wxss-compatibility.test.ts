import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function styles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.name === 'miniprogram_npm' ? [] : entry.isDirectory() ? styles(join(dir, entry.name)) : entry.name.endsWith('.wxss') ? [join(dir, entry.name)] : []);
}
it('WXSS不用组合符后直接接裸伪类的选择器，等待点使用显式类', () => {
  for (const file of styles('miniprogram')) expect(readFileSync(file, 'utf8'), file).not.toMatch(/[>+~]\s*:/);
  for (const page of ['editor', 'interview']) {
    const source = readFileSync(`miniprogram/pages/${page}/index.wxml`, 'utf8');
    expect(source).toContain('class="reply-dot-second"');
    expect(source).toContain('class="reply-dot-third"');
  }
});
