// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

it('keeps application services isolated, restartable and loopback-only', () => {
  const web = read('deploy/systemd/suiyue-web.service');
  const gateway = read('deploy/systemd/suiyue-gateway.service');
  for (const unit of [web, gateway]) {
    expect(unit).toContain('User=suiyue');
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('KillSignal=SIGTERM');
    expect(unit).toContain('ProtectSystem=strict');
    expect(unit).toContain('NoNewPrivileges=true');
  }
  expect(web).toContain('--hostname 127.0.0.1');
  expect(web).toContain('--port 3011');
  expect(gateway).toContain('EnvironmentFile=/etc/suiyue-yousheng/runtime.env');
  expect(read('deploy/runtime.env.example')).toContain('TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh');
});

it('protects the exact HTTPS origin while preserving same-origin API and WebSocket routes', () => {
  const nginx = read('deploy/nginx/suiyue-yousheng.conf');
  expect(nginx).toContain('server_name suiyue.maicong.chat;');
  expect(nginx).toContain('auth_basic_user_file /etc/nginx/suiyue-yousheng.htpasswd;');
  expect(nginx).toContain('proxy_pass http://127.0.0.1:3011;');
  expect(nginx).toContain('location ^~ /api/ai/');
  expect(nginx).toContain('proxy_pass http://127.0.0.1:3012;');
  expect(nginx).toContain('location = /api/speech {');
  expect(nginx).toContain('proxy_set_header Origin $http_origin;');
  expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade;');
  expect(nginx).toContain('Permissions-Policy "microphone=(self)');
  expect(nginx).toContain("connect-src 'self' https://suiyue.maicong.chat wss://suiyue.maicong.chat");
  expect(nginx).toContain('access_log off;');
  expect(nginx).toContain('error_log /var/log/nginx/suiyue-yousheng-error.log crit;');
  expect(nginx).toContain('proxy_headers_hash_max_size 1024;');
  expect(nginx).toContain('limit_req_status 429;');
  expect(nginx).toContain('error_page 401 /__suiyue-auth-retry;');
  expect(nginx).toContain('location = /__suiyue-auth-retry {');
  expect(nginx).toContain('internal;');
  expect(nginx).toContain('auth_basic off;');
  expect(nginx).toContain('alias /var/www/suiyue-yousheng/auth-retry.html;');
  expect(nginx).toContain('add_header Cache-Control "no-store" always;');
});

it('offers a credential-blind mobile authentication retry without looping', () => {
  const page = read('deploy/nginx/auth-retry.html');
  const installer = read('deploy/server/enable-https.sh');
  expect(page).toContain('需要重新登录');
  expect(page).toContain('id="retry"');
  expect(page).toContain('min-height: 52px');
  expect(page).toContain("document.visibilityState === 'visible'");
  expect(page).toContain("url.searchParams.has('auth_retry')");
  expect(page).toContain("url.searchParams.set('auth_retry'");
  expect(page).not.toMatch(/<input|document\.cookie|localStorage/i);
  expect(installer).toContain('install -m 0644 -o root -g root "$release_dir/deploy/nginx/auth-retry.html"');
});

it('contains no populated secret or product-layer temporary authentication', () => {
  const files = [
    'deploy/runtime.env.example',
    'deploy/systemd/suiyue-web.service',
    'deploy/systemd/suiyue-gateway.service',
    'deploy/nginx/suiyue-yousheng.conf',
    'deploy/nginx/auth-retry.html',
  ].map(read).join('\n');
  expect(files).not.toMatch(/(?:DEEPSEEK_API_KEY|TENCENT_ASR_SECRET_(?:ID|KEY))=[^\r\n]+/);
  expect(files).not.toMatch(/(?:password|passwd)\s*=/i);
});
