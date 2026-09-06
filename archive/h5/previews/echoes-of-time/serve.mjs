import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const results = await build({
  configFile: false,
  envDir: false,
  root: directory,
  publicDir: false,
  base: './',
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    write: false,
    minify: true,
    sourcemap: false,
    lib: { entry: resolve(directory, 'main.tsx'), name: 'EchoesDesign', formats: ['iife'] },
  },
});
const files = (Array.isArray(results) ? results : [results]).flatMap(result => result.output);
const chunks = files.filter(file => file.type === 'chunk');
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) throw new Error('Preview must be self-contained');
const css = files.filter(file => file.type === 'asset' && file.fileName.endsWith('.css')).map(file => String(file.source)).join('\n');
const code = chunks[0].code.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#153b2e"><title>岁月有声 · Echoes 设计预览</title><style>${css}</style></head><body><div id="root"></div><noscript>请启用 JavaScript 查看设计预览。</noscript><script>${code}</script></body></html>`;
const output = resolve(directory, '../../outputs/echoes-design');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'echoes-design.html'), html, 'utf8');
console.log(`设计预览已构建：${resolve(output, 'echoes-design.html')}`);

if (!process.argv.includes('--build')) {
  const server = createServer((request, response) => {
    const pathname = request.url?.split('?')[0];
    if (!['GET', 'HEAD'].includes(request.method ?? '') || pathname !== '/') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? '设计预览端口3004已被占用；不会自动切换端口。' : error.message);
    process.exitCode = 1;
  });
  server.listen(3004, '127.0.0.1', () => console.log('独立设计预览：http://localhost:3004（仅模拟数据，不影响正式版）'));
}
