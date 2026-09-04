#!/usr/bin/env bash
set -Eeuo pipefail

release_dir="${1:-}"
if [[ -z "$release_dir" ]]; then
  echo "usage: activate-release.sh /opt/suiyue-yousheng/releases/<version>" >&2
  exit 2
fi
release_dir="$(realpath "$release_dir")"
case "$release_dir" in
  /opt/suiyue-yousheng/releases/*) ;;
  *) echo "release path is outside /opt/suiyue-yousheng/releases" >&2; exit 2 ;;
esac
for path in package.json package-lock.json deploy/systemd/suiyue-web.service deploy/systemd/suiyue-gateway.service deploy/server/sqlite-db.mjs; do
  [[ -f "$release_dir/$path" ]] || { echo "release is missing $path" >&2; exit 2; }
done
[[ "$(stat -c '%a:%U:%G' /etc/suiyue-yousheng/runtime.env 2>/dev/null || true)" == "600:root:root" ]] || { echo "runtime.env must be 0600 root:root" >&2; exit 2; }
[[ "$(stat -c '%a:%U:%G' /etc/nginx/suiyue-yousheng.htpasswd 2>/dev/null || true)" == "640:root:www-data" ]] || { echo "htpasswd must be 0640 root:www-data" >&2; exit 2; }
data_dir=/var/lib/suiyue-yousheng
identity_db="$data_dir/auth.sqlite"
topics_db="$data_dir/topics.sqlite"
[[ "$(realpath "$data_dir" 2>/dev/null || true)" == "$data_dir" ]] || { echo "application data directory is unsafe" >&2; exit 2; }
[[ "$(stat -c '%a:%U:%G' "$data_dir" 2>/dev/null || true)" == "700:suiyue:suiyue" ]] || { echo "application data directory must be 0700 suiyue:suiyue" >&2; exit 2; }
[[ "$(stat -c '%a:%U:%G' "$data_dir/backups" 2>/dev/null || true)" == "700:root:root" ]] || { echo "backup directory must be 0700 root:root" >&2; exit 2; }
[[ "$(stat -c '%a:%U:%G' "$data_dir/failed" 2>/dev/null || true)" == "700:root:root" ]] || { echo "quarantine directory must be 0700 root:root" >&2; exit 2; }
[[ "$(grep -Ec '^WECHAT_MINIPROGRAM_APP_ID=[^[:space:]].*$' /etc/suiyue-yousheng/runtime.env)" == 1 ]] || { echo "WeChat AppID is not configured" >&2; exit 2; }
[[ "$(grep -Ec '^WECHAT_MINIPROGRAM_APP_SECRET=[^[:space:]].*$' /etc/suiyue-yousheng/runtime.env)" == 1 ]] || { echo "WeChat AppSecret is not configured" >&2; exit 2; }
[[ "$(grep -Ec '^TOPIC_ADMIN_USERNAME=[A-Za-z0-9._@-]{3,64}$' /etc/suiyue-yousheng/runtime.env)" == 1 ]] || { echo "topic administrator username is not configured" >&2; exit 2; }
[[ "$(grep -Ec '^TOPIC_ADMIN_PASSWORD_HASH=scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' /etc/suiyue-yousheng/runtime.env)" == 1 ]] || { echo "topic administrator password hash is not configured" >&2; exit 2; }
grep -Fxq "SUIYUE_AUTH_DB_PATH=$identity_db" /etc/suiyue-yousheng/runtime.env || { echo "identity database path is not configured" >&2; exit 2; }
grep -Fxq "SUIYUE_TOPICS_DB_PATH=$topics_db" /etc/suiyue-yousheng/runtime.env || { echo "topics database path is not configured" >&2; exit 2; }

cd "$release_dir"
/usr/bin/npm ci --no-audit --no-fund
/usr/bin/npm run build
chown -R root:root "$release_dir"
find "$release_dir" -xdev -type d -exec chmod go-w {} +
find "$release_dir" -xdev -type f -exec chmod go-w {} +

current=/opt/suiyue-yousheng/current
previous_target=""
if [[ -L "$current" ]]; then
  previous_target="$(realpath "$current")"
  case "$previous_target" in /opt/suiyue-yousheng/releases/*) ;; *) echo "current target is unsafe" >&2; exit 2 ;; esac
  ln -sfn "$previous_target" /opt/suiyue-yousheng/previous
elif [[ -e "$current" ]]; then
  echo "refusing to replace non-symlink $current" >&2
  exit 2
fi

activated=0
migration_attempted=0
gateway_was_active=0
identity_backup=""
topics_backup=""
release_name="${release_dir##*/}"
[[ "$release_name" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "release name is unsafe" >&2; exit 2; }
database_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
identity_quarantine="$data_dir/failed/${release_name}-${database_stamp}-auth"
topics_quarantine="$data_dir/failed/${release_name}-${database_stamp}-topics"

secure_database_files() {
  local database_path="$1"
  for file in "$database_path" "$database_path-wal" "$database_path-shm"; do
    if [[ -e "$file" ]]; then chown suiyue:suiyue "$file"; chmod 0600 "$file"; fi
  done
}

restore_database() {
  local backup_path="$1" database_path="$2" quarantine_path="$3"
  local restore_source="${backup_path:--}"
  /usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" restore "$restore_source" "$database_path" "$quarantine_path"
  secure_database_files "$database_path"
}

rollback_on_error() {
  local status="${1:-$?}"
  trap - ERR
  set +e
  if [[ "$migration_attempted" == 1 ]]; then
    systemctl stop suiyue-gateway.service
    restore_database "$identity_backup" "$identity_db" "$identity_quarantine"
    restore_database "$topics_backup" "$topics_db" "$topics_quarantine"
    find "$data_dir/failed" -maxdepth 1 -type f -name "${release_name}-${database_stamp}-*.sqlite*" -exec chown root:root {} + -exec chmod 0600 {} +
  fi
  if [[ "$activated" == 1 ]]; then
    if [[ -n "$previous_target" ]]; then
      ln -sfn "$previous_target" "$current"
      systemctl restart suiyue-gateway.service suiyue-web.service || true
    else
      systemctl stop suiyue-gateway.service suiyue-web.service || true
    fi
  elif [[ "$gateway_was_active" == 1 ]]; then
    systemctl start suiyue-gateway.service || true
  fi
  exit "$status"
}
trap rollback_on_error ERR

if systemctl is-active --quiet suiyue-gateway.service; then
  gateway_was_active=1
  systemctl stop suiyue-gateway.service
fi
for database_path in "$identity_db" "$topics_db"; do
  if [[ -e "$database_path" && ( ! -f "$database_path" || -L "$database_path" ) ]]; then
    echo "application database is unsafe" >&2
    rollback_on_error 2
  fi
done
if [[ -e "$identity_db" ]]; then
  /usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$identity_db" 1
  identity_backup="$data_dir/backups/${release_name}-${database_stamp}-auth.sqlite"
  /usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" backup "$identity_db" "$identity_backup"
  chown root:root "$identity_backup"
  chmod 0600 "$identity_backup"
fi
if [[ -e "$topics_db" ]]; then
  /usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$topics_db" 1
  topics_backup="$data_dir/backups/${release_name}-${database_stamp}-topics.sqlite"
  /usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" backup "$topics_db" "$topics_backup"
  chown root:root "$topics_backup"
  chmod 0600 "$topics_backup"
fi

install -m 0644 -o root -g root "$release_dir/deploy/systemd/suiyue-web.service" /etc/systemd/system/suiyue-web.service
install -m 0644 -o root -g root "$release_dir/deploy/systemd/suiyue-gateway.service" /etc/systemd/system/suiyue-gateway.service
systemctl daemon-reload
ln -sfn "$release_dir" "$current"
activated=1
systemctl enable suiyue-web.service suiyue-gateway.service
migration_attempted=1
systemctl restart suiyue-gateway.service suiyue-web.service
health="$(/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3012/api/health)"
grep -Fq '"miniIdentityConfigured":true' <<<"$health"
grep -Fq '"topicsConfigured":true' <<<"$health"
grep -Fq '"topicAiConfigured":true' <<<"$health"
grep -Fq '"topicAdminConfigured":true' <<<"$health"
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3011/ >/dev/null
/usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$identity_db" 1
/usr/bin/node "$release_dir/deploy/server/sqlite-db.mjs" check "$topics_db" 1
secure_database_files "$identity_db"
secure_database_files "$topics_db"
activated=0
migration_attempted=0
trap - ERR
