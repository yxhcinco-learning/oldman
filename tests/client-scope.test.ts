// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
it('serves operations without the retired H5 entry or global theme', () => {
  expect(read('app/page.tsx')).toContain("redirect('/admin/topics')");
  expect(read('app/globals.css')).not.toMatch(/tailwindcss|phone-shell|chat-bubble|--forest/);
  expect(read('app/layout.tsx')).toContain('运营后台');
  expect(existsSync('features/writing/ProductApp.tsx')).toBe(false);
  expect(existsSync('archive/h5/features/writing/ProductApp.tsx')).toBe(true);
});
it('excludes the archive from checks and release archives', () => {
  expect(JSON.parse(read('tsconfig.json')).exclude).toContain('archive');
  expect(read('eslint.config.mjs')).toContain('archive/**');
  expect(read('vitest.config.ts')).toContain("include: ['tests/**/*.test.{ts,tsx}']");
  expect(read('.gitattributes')).toContain('archive/ export-ignore');
  const manifest = JSON.parse(read('package.json'));
  expect(manifest.dependencies.idb).toBeUndefined();
  expect(manifest.scripts['build:admin']).toBeTruthy();
  expect(manifest.scripts['build:web']).toBeUndefined();
});
