import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    'archive/**', '.tmp/**', 'outputs/**', 'work/**', 'test-results/**',
    '.next/**', 'out/**', 'build/**', 'next-env.d.ts',
  ]),
]);

export default eslintConfig;
