// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves all approved typography, spacing and responsive rules', () => {
  const css = readFileSync('app/globals.css', 'utf8').replace(/\r\n/g, '\n');
  const baseline = css.split('/* Product additions')[0].trim();
  // Derived from commit 28fd5e4:app/globals.css, removing only the retired
  // mock-keyboard rules and its hover media query. Update only with UI approval.
  expect(createHash('sha256').update(baseline).digest('hex')).toBe('52f10264154e9369683944058084f7b23bcc2331c2986b0a692c868b31c8c18d');
  expect(css).not.toMatch(/\.(?:work-row|work-menu|library-links|save-row)\b/);
});

it('keeps the approved unified writing presentation scoped to the real editor', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const rule = (selector: string) => {
    const line = css.split('\n').find(value => value.startsWith(`${selector} {`));
    expect(line, `Missing style rule: ${selector}`).toBeDefined();
    const block = line!.split('{')[1].split('}')[0];
    return Object.fromEntries(block.split(';').filter(part => part.trim()).map(part => part.split(':').map(value => value.trim())));
  };
  expect(rule('.writing-canvas')).toEqual({ display: 'flex', 'flex-direction': 'column' });
  expect(rule('.writing-body')).toMatchObject({ 'white-space': 'pre-wrap', 'overflow-wrap': 'break-word', 'scrollbar-width': 'none', '--writing-placeholder': '#aba99f' });
  expect(rule('.writing-body::placeholder, .writing-placeholder')).toEqual({ color: 'var(--writing-placeholder)', opacity: '1' });
  expect(rule('.writing-placeholder')).toEqual({ margin: '0', font: 'inherit' });
  expect(rule('.writing-paragraph')).toMatchObject({ display: 'block', width: '100%', padding: '0', margin: '0', border: '0', background: 'transparent', font: 'inherit', 'white-space': 'inherit', 'text-align': 'inherit', 'overflow-wrap': 'inherit' });
  expect(rule('.writing-paragraph > span')).toEqual({ display: 'block' });
  expect(rule('.writing-paragraph + .writing-paragraph')['margin-top']).toBe(`${rule('.full-text-editor')['line-height']}em`);
});
