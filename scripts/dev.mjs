import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const port of [3001, 3002]) {
  try { await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); }); }
  catch { console.error(`端口 ${port} 已被占用。请先停止已有服务；不会自动更换端口。`); process.exit(1); }
}
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', '--import', 'tsx', 'server/index.ts'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [resolve(root, 'node_modules/vinext/dist/cli.js'), 'dev', '--port', '3001'], { cwd: root, stdio: 'inherit' }),
];
let shuttingDown = false;
function shutdown(code = 0) { if (shuttingDown) return; shuttingDown = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', () => shutdown(1)); child.on('exit', code => shutdown(code ?? 1)); }
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
