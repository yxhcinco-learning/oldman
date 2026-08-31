import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [{
      find: /^@suiyue\/core\/(.+)$/,
      replacement: `${fileURLToPath(new URL('../../packages/core/src/', import.meta.url))}$1.ts`,
    }],
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], restoreMocks: true },
});
