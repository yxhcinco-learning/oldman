#!/usr/bin/env bash
set -Eeuo pipefail

target="${1:-/opt/suiyue-yousheng/previous}"
target="$(realpath "$target")"
case "$target" in
  /opt/suiyue-yousheng/releases/*) ;;
  *) echo "rollback target is outside the release directory" >&2; exit 2 ;;
esac
[[ -f "$target/package.json" && -d "$target/dist" ]] || { echo "rollback target is not a built release" >&2; exit 2; }
current=/opt/suiyue-yousheng/current
[[ -L "$current" ]] || { echo "current is not a symlink" >&2; exit 2; }
current_target="$(realpath "$current")"
case "$current_target" in /opt/suiyue-yousheng/releases/*) ;; *) echo "current target is unsafe" >&2; exit 2 ;; esac
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
identity_db=/var/lib/suiyue-yousheng/auth.sqlite
topics_db=/var/lib/suiyue-yousheng/topics.sqlite

# A normal code rollback never restores, deletes or rewrites data. Refuse only
# when the selected release's known schema ceiling cannot read the databases.
/usr/bin/node "$script_dir/sqlite-db.mjs" check "$identity_db" 1
/usr/bin/node "$script_dir/sqlite-db.mjs" check "$topics_db" 1
rollback_on_error() {
  local status="${1:-$?}"
  trap - ERR
  set +e
  ln -sfn "$current_target" "$current"
  systemctl restart suiyue-gateway.service suiyue-web.service
  exit "$status"
}
trap rollback_on_error ERR
ln -sfn "$target" "$current"
systemctl restart suiyue-gateway.service suiyue-web.service
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3012/api/health >/dev/null
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3011/ >/dev/null
/usr/bin/node "$script_dir/sqlite-db.mjs" check "$identity_db" 1
/usr/bin/node "$script_dir/sqlite-db.mjs" check "$topics_db" 1
trap - ERR
