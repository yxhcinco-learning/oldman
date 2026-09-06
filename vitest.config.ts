import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: [{ find: '@suiyue/core', replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) }] },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'], restoreMocks: true, testTimeout: 15000 },
});
