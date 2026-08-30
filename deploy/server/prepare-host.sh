#!/usr/bin/env bash
set -Eeuo pipefail

release_dir="${1:-}"
if [[ -z "$release_dir" ]]; then
  echo "usage: prepare-host.sh /opt/suiyue-yousheng/releases/<version>" >&2
  exit 2
fi
release_dir="$(realpath "$release_dir")"
case "$release_dir" in
  /opt/suiyue-yousheng/releases/*) ;;
  *) echo "release path is outside /opt/suiyue-yousheng/releases" >&2; exit 2 ;;
esac
[[ -f "$release_dir/deploy/nginx/suiyue-yousheng-http.conf" ]] || { echo "release is incomplete" >&2; exit 2; }

if ! id -u suiyue >/dev/null 2>&1; then
  useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin --user-group suiyue
fi
install -d -m 0755 -o root -g root /opt/suiyue-yousheng /opt/suiyue-yousheng/releases /etc/suiyue-yousheng /var/www/letsencrypt

enabled=/etc/nginx/sites-enabled/suiyue-yousheng.conf
if [[ -e "$enabled" && ! -L "$enabled" ]]; then
  echo "refusing to replace non-symlink $enabled" >&2
  exit 2
fi
install -m 0644 -o root -g root "$release_dir/deploy/nginx/suiyue-yousheng-http.conf" /etc/nginx/sites-available/suiyue-yousheng.conf
ln -sfn /etc/nginx/sites-available/suiyue-yousheng.conf "$enabled"
nginx -t
systemctl reload nginx
