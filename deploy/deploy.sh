#!/usr/bin/env bash
#
# deploy.sh — pull the latest code and propagate it to ALL tenants at once.
#
# Because every tenant runs off the SAME build in appDir, one rebuild updates
# everyone. Each tenant's DB migrates itself on restart.
#
# Usage:  deploy/deploy.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(node -e "process.stdout.write(require('$HERE/tenants.json').appDir)")"
HTPASSWD_DIR="$(node -e "process.stdout.write(require('$HERE/tenants.json').htpasswdDir)")"

echo "→ Updating code in $APP_DIR"
cd "$APP_DIR"
git pull --ff-only

echo "→ Installing dependencies"
pnpm install --frozen-lockfile

echo "→ Building (CLI + web)"
pnpm build:release

echo "→ Regenerating tenant configs"
node "$HERE/gen-config.mjs"

echo "→ Reloading all tenants (zero-downtime) with refreshed env"
pm2 reload "$HERE/ecosystem.config.cjs" --update-env
pm2 save

echo "→ Refreshing nginx (htpasswd + server blocks)"
sudo mkdir -p "$HTPASSWD_DIR"
sudo cp "$HERE"/htpasswd/*.htpasswd "$HTPASSWD_DIR"/
sudo cp "$HERE/shep.nginx.conf" /etc/nginx/conf.d/shep.conf
sudo nginx -t
sudo systemctl reload nginx

echo "✓ All tenants updated to $(git rev-parse --short HEAD)"
pm2 list
