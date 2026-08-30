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
[[ ! -e "$current" || -L "$current" ]] || { echo "current is not a symlink" >&2; exit 2; }
ln -sfn "$target" "$current"
systemctl restart suiyue-gateway.service suiyue-web.service
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3012/api/health >/dev/null
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3011/ >/dev/null
