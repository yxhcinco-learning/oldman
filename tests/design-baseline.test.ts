// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves all approved V2 typography, spacing and responsive rules', () => {
  const css = readFileSync('app/globals.css', 'utf8').replace(/\r\n/g, '\n');
  const baseline = css.split('/* Product additions')[0].trim();
  // Derived from demo-approved-v2:app/globals.css, removing only the retired
  // mock-keyboard rules and its hover media query. Update only with UI approval.
  expect(createHash('sha256').update(baseline).digest('hex')).toBe('52f10264154e9369683944058084f7b23bcc2331c2986b0a692c868b31c8c18d');
  expect(css).not.toMatch(/\.(?:work-row|work-menu|library-links|save-row)\b/);
});
