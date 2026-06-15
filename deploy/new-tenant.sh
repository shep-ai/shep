#!/usr/bin/env bash
#
# new-tenant.sh — provision one new company/tenant end-to-end.
#
# Usage:
#   deploy/new-tenant.sh <id> <subdomain> <port>
#   deploy/new-tenant.sh companyD companyd 4054
#
# What it does:
#   1. Creates the tenant's isolated dirs ($SHEP_HOME + $GH_CONFIG_DIR)
#   2. Logs that tenant into GitHub with its OWN credentials (gh, scoped via GH_CONFIG_DIR)
#   3. Prompts for a Caddy login password and hashes it
#   4. Appends the tenant to deploy/tenants.json
#   5. Regenerates ecosystem.config.cjs + Caddyfile
#   6. Starts the new pm2 process and reloads Caddy
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$HERE/tenants.json"

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <id> <subdomain> <port>" >&2
  exit 1
fi

ID="$1"; SUBDOMAIN="$2"; PORT="$3"

command -v gh   >/dev/null || { echo "✖ gh CLI not found"   >&2; exit 1; }
command -v caddy>/dev/null || { echo "✖ caddy not found"    >&2; exit 1; }
command -v pm2  >/dev/null || { echo "✖ pm2 not found"      >&2; exit 1; }
command -v node >/dev/null || { echo "✖ node not found"     >&2; exit 1; }

TENANTS_ROOT="$(node -e "process.stdout.write(require('$CONFIG').tenantsRoot)")"
SHEP_HOME_DIR="$TENANTS_ROOT/$ID/.shep"
GH_DIR="$TENANTS_ROOT/$ID/gh"

echo "→ Creating isolated directories for '$ID'"
mkdir -p "$SHEP_HOME_DIR" "$GH_DIR"
chmod 700 "$SHEP_HOME_DIR" "$GH_DIR"

echo "→ Log this tenant into GitHub with ITS OWN account (credentials scoped to $GH_DIR)"
GH_CONFIG_DIR="$GH_DIR" gh auth login

echo "→ Set the web login password for https://$SUBDOMAIN.<domain>"
HASH="$(caddy hash-password)"

echo "→ Adding '$ID' to tenants.json"
node -e '
  const fs = require("fs");
  const p = process.argv[1];
  const [id, subdomain, port, authHash] = process.argv.slice(2);
  const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  if (cfg.tenants.some(t => t.id === id)) { console.error("✖ tenant id already exists: " + id); process.exit(1); }
  if (cfg.tenants.some(t => t.subdomain === subdomain)) { console.error("✖ subdomain already exists: " + subdomain); process.exit(1); }
  if (cfg.tenants.some(t => String(t.port) === String(port))) { console.error("✖ port already in use: " + port); process.exit(1); }
  cfg.tenants.push({ id, subdomain, port: Number(port), authUser: subdomain, authHash });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
' "$CONFIG" "$ID" "$SUBDOMAIN" "$PORT" "$HASH"

echo "→ Regenerating pm2 + Caddy configs"
node "$HERE/gen-config.mjs"

echo "→ Starting pm2 process shep-$ID"
pm2 start "$HERE/ecosystem.config.cjs" --only "shep-$ID" --update-env

echo "→ Installing + reloading Caddy"
sudo cp "$HERE/Caddyfile" /etc/caddy/Caddyfile
sudo systemctl reload caddy

cat <<EOF

✓ Tenant '$ID' is live.
  URL:        https://$SUBDOMAIN.$(node -e "process.stdout.write(require('$CONFIG').domain)")
  SHEP_HOME:  $SHEP_HOME_DIR
  GH config:  $GH_DIR
  Port:       $PORT

DNS reminder: ensure '$SUBDOMAIN' resolves to this server (a wildcard *.<domain>
record means you never have to touch DNS for new tenants again).
EOF
