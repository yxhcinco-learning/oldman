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
for path in package.json package-lock.json deploy/systemd/suiyue-web.service deploy/systemd/suiyue-gateway.service; do
  [[ -f "$release_dir/$path" ]] || { echo "release is missing $path" >&2; exit 2; }
done
[[ "$(stat -c '%a:%U:%G' /etc/suiyue-yousheng/runtime.env 2>/dev/null || true)" == "600:root:root" ]] || { echo "runtime.env must be 0600 root:root" >&2; exit 2; }
[[ "$(stat -c '%a:%U:%G' /etc/nginx/suiyue-yousheng.htpasswd 2>/dev/null || true)" == "640:root:www-data" ]] || { echo "htpasswd must be 0640 root:www-data" >&2; exit 2; }

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
rollback_on_error() {
  if [[ "$activated" == 1 ]]; then
    if [[ -n "$previous_target" ]]; then
      ln -sfn "$previous_target" "$current"
      systemctl restart suiyue-gateway.service suiyue-web.service || true
    else
      systemctl stop suiyue-gateway.service suiyue-web.service || true
    fi
  fi
}
trap rollback_on_error ERR

install -m 0644 -o root -g root "$release_dir/deploy/systemd/suiyue-web.service" /etc/systemd/system/suiyue-web.service
install -m 0644 -o root -g root "$release_dir/deploy/systemd/suiyue-gateway.service" /etc/systemd/system/suiyue-gateway.service
systemctl daemon-reload
ln -sfn "$release_dir" "$current"
activated=1
systemctl enable suiyue-web.service suiyue-gateway.service
systemctl restart suiyue-gateway.service suiyue-web.service
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3012/api/health >/dev/null
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3011/ >/dev/null
activated=0
trap - ERR
