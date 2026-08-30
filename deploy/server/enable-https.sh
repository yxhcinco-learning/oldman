#!/usr/bin/env bash
set -Eeuo pipefail

release_dir="$(realpath /opt/suiyue-yousheng/current)"
case "$release_dir" in
  /opt/suiyue-yousheng/releases/*) ;;
  *) echo "current release is unsafe" >&2; exit 2 ;;
esac
[[ -s /etc/letsencrypt/live/suiyue.maicong.chat/fullchain.pem ]] || { echo "TLS certificate is missing" >&2; exit 2; }
[[ "$(stat -c '%a:%U:%G' /etc/nginx/suiyue-yousheng.htpasswd 2>/dev/null || true)" == "640:root:www-data" ]] || { echo "htpasswd must be 0640 root:www-data" >&2; exit 2; }
install -m 0644 -o root -g root "$release_dir/deploy/nginx/suiyue-yousheng.conf" /etc/nginx/sites-available/suiyue-yousheng.conf
nginx -t
systemctl reload nginx
