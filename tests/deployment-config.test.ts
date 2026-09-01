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
  expect(gateway).toContain('ReadWritePaths=/var/lib/suiyue-yousheng');
  expect(read('deploy/runtime.env.example')).toContain('TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh');
  expect(read('deploy/runtime.env.example')).toContain('SUIYUE_AUTH_DB_PATH=/var/lib/suiyue-yousheng/auth.sqlite');
});

it('protects the exact HTTPS origin while preserving same-origin API and WebSocket routes', () => {
  const nginx = read('deploy/nginx/suiyue-yousheng.conf');
  expect(nginx).toContain('server_name suiyue.maicong.chat;');
  expect(nginx).toContain('auth_basic_user_file /etc/nginx/suiyue-yousheng.htpasswd;');
  expect(nginx).toContain('proxy_pass http://127.0.0.1:3011;');
  expect(nginx).toContain('location ^~ /api/ai/');
  expect(nginx).toContain('location = /api/topics');
  expect(nginx).toContain('location ~ ^/api/topics/[a-z0-9]+(?:-[a-z0-9]+)*$');
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
  for (const route of ['/api/topics', '/api/mini/auth/wechat', '/api/mini/ai/turn', '/api/mini/speech-ticket', '/api/mini/speech']) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const location = new RegExp(`location = ${escaped} \\{([\\s\\S]*?)\\n    \\}`).exec(nginx)?.[1] ?? '';
    expect(location, route).toContain('auth_basic off;');
  }
  const topicDetail = /location ~ \^\/api\/topics\/\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$ \{([\s\S]*?)\n    \}/.exec(nginx)?.[1] ?? '';
  expect(topicDetail).toContain('auth_basic off;');
  expect(nginx).toContain('zone=suiyue_mini_login');
  expect(nginx).toContain('zone=suiyue_mini_ai');
  expect(nginx).toContain('zone=suiyue_mini_ticket');
  expect(nginx).toContain('zone=suiyue_mini_speech');
  expect(nginx).toContain('location ^~ /api/mini/');
  expect(nginx).toContain('location /api/ {');
  expect(nginx).not.toContain('location ^~ /api/ {');
  const miniSpeech = /location = \/api\/mini\/speech \{([\s\S]*?)\n    \}/.exec(nginx)?.[1] ?? '';
  expect(miniSpeech).toContain('access_log off;');
  expect(miniSpeech).toContain('proxy_set_header Upgrade $http_upgrade;');
  expect(miniSpeech).not.toContain('proxy_set_header Origin');
});

it('prepares, backs up and verifies the release-external identity database without printing configuration values', () => {
  const prepare = read('deploy/server/prepare-host.sh');
  const activate = read('deploy/server/activate-release.sh');
  const verify = read('deploy/server/verify-host.sh');
  expect(prepare).toContain('install -d -m 0700 -o suiyue -g suiyue /var/lib/suiyue-yousheng');
  expect(activate).toContain('deploy/server/identity-db.mjs" backup');
  expect(activate).toContain('deploy/server/identity-db.mjs" restore');
  expect(activate).toContain('"miniIdentityConfigured":true');
  expect(activate).toContain('WECHAT_MINIPROGRAM_APP_SECRET=[^[:space:]]');
  expect(verify).toContain('systemctl restart suiyue-gateway.service');
  expect(verify).toContain('identity database was replaced during restart');
  expect(verify).toContain('reviewed topic detail is not reachable without Basic Auth');
  expect(verify).toContain('service logs contain a forbidden sensitive marker');
  expect(verify).not.toMatch(/printenv|source \/etc\/suiyue-yousheng\/runtime\.env|cat \/etc\/suiyue-yousheng\/runtime\.env/);
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
  expect(files).not.toMatch(/WECHAT_MINIPROGRAM_(?:APP_ID|APP_SECRET)=[^\r\n]+/);
  expect(files).not.toMatch(/(?:password|passwd)\s*=/i);
});
