#!/usr/bin/env bash
set -Eeuo pipefail

origin=https://suiyue.maicong.chat
release_dir="$(realpath /opt/suiyue-yousheng/current)"
case "$release_dir" in /opt/suiyue-yousheng/releases/*) ;; *) echo "current release is unsafe" >&2; exit 2 ;; esac
identity_db=/var/lib/suiyue-yousheng/auth.sqlite
topics_db=/var/lib/suiyue-yousheng/topics.sqlite
headers="$(mktemp)"
body="$(mktemp)"
trap 'rm -f -- "$headers" "$body"' EXIT

for unit in suiyue-web.service suiyue-gateway.service nginx.service; do
  systemctl is-active --quiet "$unit" || { echo "$unit is not active" >&2; exit 2; }
done

listeners="$(ss -ltnH)"
grep -Eq '127\.0\.0\.1:3011([[:space:]]|$)' <<<"$listeners" || { echo "web loopback listener is missing" >&2; exit 2; }
grep -Eq '127\.0\.0\.1:3012([[:space:]]|$)' <<<"$listeners" || { echo "gateway loopback listener is missing" >&2; exit 2; }
if grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):301[12]([[:space:]]|$)' <<<"$listeners"; then
  echo "application port is publicly bound" >&2
  exit 2
fi

/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3011/ >/dev/null
health="$(/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3012/api/health)"
for marker in '"miniIdentityConfigured":true' '"topicsConfigured":true' '"topicAiConfigured":true' '"topicAdminConfigured":true'; do
  grep -Fq "$marker" <<<"$health" || { echo "required gateway capability is not configured" >&2; exit 2; }
done
/usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$identity_db" 1
/usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$topics_db" 1

status="$(/usr/bin/curl -sS --max-time 10 -D "$headers" -o "$body" -w '%{http_code}' "$origin/")"
[[ "$status" == 401 ]] || { echo "unauthenticated web status is not 401" >&2; exit 2; }
grep -Eiq '^WWW-Authenticate:' "$headers" || { echo "web authentication challenge is missing" >&2; exit 2; }
grep -Eiq '^Cache-Control: no-store' "$headers" || { echo "web authentication response is cacheable" >&2; exit 2; }

status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' "$origin/admin/topics")"
[[ "$status" == 200 ]] || { echo "topic editorial console is not reachable without Basic Auth" >&2; exit 2; }
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' "$origin/api/admin/auth/session")"
[[ "$status" == 401 ]] || { echo "topic editorial session endpoint is not app-protected" >&2; exit 2; }
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' -H "Origin: $origin" -H 'Content-Type: application/json' --data '{}' "$origin/api/admin/auth/login")"
[[ "$status" == 401 ]] || { echo "topic editorial login rejection path failed" >&2; exit 2; }

status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' "$origin/api/topics?limit=1")"
[[ "$status" == 200 ]] || { echo "reviewed topics are not reachable without Basic Auth" >&2; exit 2; }
topic_id="$(/usr/bin/node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const id=value?.topics?.[0]?.id; if(id!==undefined && (typeof id!=="string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) process.exit(2); if(id) process.stdout.write(id);' "$body")"
if [[ -n "$topic_id" ]]; then
  status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' "$origin/api/topics/$topic_id")"
  [[ "$status" == 200 ]] || { echo "reviewed topic detail is not reachable without Basic Auth" >&2; exit 2; }
fi
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' -H 'Content-Type: application/json' --data '{}' "$origin/api/mini/auth/wechat")"
[[ "$status" == 400 ]] || { echo "mini login rejection path failed" >&2; exit 2; }
invalid_token="$(printf 'x%.0s' {1..43})"
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $invalid_token" --data '{}' "$origin/api/mini/ai/turn")"
[[ "$status" == 401 ]] || { echo "mini AI session rejection path failed" >&2; exit 2; }
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $invalid_token" --data '{}' "$origin/api/mini/speech-ticket")"
[[ "$status" == 401 ]] || { echo "mini speech-ticket rejection path failed" >&2; exit 2; }
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' "$origin/api/mini/speech?ticket=$invalid_token")"
[[ "$status" == 401 ]] || { echo "mini speech WebSocket rejection path failed" >&2; exit 2; }
status="$(/usr/bin/curl -sS --max-time 10 -o "$body" -w '%{http_code}' "$origin/api/mini/not-listed")"
[[ "$status" == 404 ]] || { echo "unlisted mini API is not denied" >&2; exit 2; }

identity_inode="$(stat -c '%d:%i' "$identity_db")"
topics_inode="$(stat -c '%d:%i' "$topics_db")"
systemctl restart suiyue-gateway.service
health="$(/usr/bin/curl -fsS --retry 10 --retry-delay 1 --retry-connrefused --max-time 2 http://127.0.0.1:3012/api/health)"
grep -Fq '"miniIdentityConfigured":true' <<<"$health"
grep -Fq '"topicsConfigured":true' <<<"$health"
[[ "$(stat -c '%d:%i' "$identity_db")" == "$identity_inode" ]] || { echo "identity database was replaced during restart" >&2; exit 2; }
[[ "$(stat -c '%d:%i' "$topics_db")" == "$topics_inode" ]] || { echo "topics database was replaced during restart" >&2; exit 2; }
/usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$identity_db" 1
/usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$topics_db" 1

if journalctl -u suiyue-web.service -u suiyue-gateway.service --since '-10 minutes' -o cat --no-pager |
  grep -Eiq 'WECHAT_MINIPROGRAM_APP_SECRET|DEEPSEEK_API_KEY|TENCENT_ASR_SECRET|TOPIC_ADMIN_PASSWORD_HASH|session_key|openid|Authorization:|Cookie:|Bearer [A-Za-z0-9_-]|ticket='; then
  echo "service logs contain a forbidden sensitive marker" >&2
  exit 2
fi

echo "host verification passed; valid Basic Auth, valid editorial login and real provider/device checks remain external"
