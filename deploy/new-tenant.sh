#!/usr/bin/env bash
#
# new-tenant.sh — provision one new company/tenant end-to-end (nginx flow).
#
# Usage:
#   deploy/new-tenant.sh <id> <subdomain> <port>
#   deploy/new-tenant.sh companyD companyd 4054
#
# What it does:
#   1. Creates the tenant's isolated dirs ($SHEP_HOME + $GH_CONFIG_DIR)
#   2. Logs that tenant into GitHub with its OWN credentials (scoped via GH_CONFIG_DIR)
#   3. Prompts for a web login password and hashes it (htpasswd -B)
#   4. Appends the tenant to deploy/tenants.json
#   5. Regenerates ecosystem.config.cjs + shep.nginx.conf + htpasswd files
#   6. Installs them, starts the new pm2 process, reloads nginx
#
# The wildcard TLS cert already covers any new subdomain, so no per-tenant cert.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$HERE/tenants.json"

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <id> <subdomain> <port>" >&2
  exit 1
fi
ID="$1"; SUBDOMAIN="$2"; PORT="$3"

command -v gh       >/dev/null || { echo "✖ gh CLI not found"   >&2; exit 1; }
command -v htpasswd >/dev/null || { echo "✖ htpasswd not found (install apache2-utils / httpd-tools)" >&2; exit 1; }
command -v pm2      >/dev/null || { echo "✖ pm2 not found"      >&2; exit 1; }
command -v node     >/dev/null || { echo "✖ node not found"     >&2; exit 1; }

TENANTS_ROOT="$(node -e "process.stdout.write(require('$CONFIG').tenantsRoot)")"
HTPASSWD_DIR="$(node -e "process.stdout.write(require('$CONFIG').htpasswdDir)")"
SHEP_HOME_DIR="$TENANTS_ROOT/$ID/.shep"
GH_DIR="$TENANTS_ROOT/$ID/gh"

echo "→ Creating isolated directories for '$ID'"
mkdir -p "$SHEP_HOME_DIR" "$GH_DIR"
chmod 700 "$SHEP_HOME_DIR" "$GH_DIR"

echo "→ Log this tenant into GitHub with ITS OWN account (credentials scoped to $GH_DIR)"
GH_CONFIG_DIR="$GH_DIR" gh auth login

echo "→ Set the web login password for https://$SUBDOMAIN.<domain>"
read -rsp "  Password: " PW; echo
HASH="$(htpasswd -nbB "$SUBDOMAIN" "$PW" | cut -d: -f2-)"
unset PW

echo "→ Adding '$ID' to tenants.json"
node -e '
  const fs = require("fs");
  const [p, id, subdomain, port, authHash] = process.argv.slice(1);
  const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [k,v] of [["id",id],["subdomain",subdomain],["port",Number(port)]])
    if (cfg.tenants.some(t => String(t[k]) === String(v))) { console.error("✖ "+k+" already in use: "+v); process.exit(1); }
  cfg.tenants.push({ id, subdomain, port: Number(port), authUser: subdomain, authHash });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
' "$CONFIG" "$ID" "$SUBDOMAIN" "$PORT" "$HASH"

echo "→ Regenerating configs"
node "$HERE/gen-config.mjs"

echo "→ Installing htpasswd + nginx config"
sudo mkdir -p "$HTPASSWD_DIR"
sudo cp "$HERE"/htpasswd/*.htpasswd "$HTPASSWD_DIR"/
sudo cp "$HERE/shep.nginx.conf" /etc/nginx/conf.d/shep.conf
sudo nginx -t
sudo systemctl reload nginx

echo "→ Starting pm2 process shep-$ID"
pm2 start "$HERE/ecosystem.config.cjs" --only "shep-$ID" --update-env
pm2 save

DOMAIN="$(node -e "process.stdout.write(require('$CONFIG').domain)")"
cat <<EOF

✓ Tenant '$ID' is live.
  URL:        https://$SUBDOMAIN.$DOMAIN
  SHEP_HOME:  $SHEP_HOME_DIR
  GH config:  $GH_DIR
  Port:       $PORT

(The wildcard *.$DOMAIN DNS record + wildcard cert already cover this subdomain.)
EOF
