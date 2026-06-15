# Multi-Tenant Deployment

Run several fully-isolated copies of Shep from **one codebase / one build**, one
process per company, fronted by a single domain with per-subdomain login.

Each tenant gets its own DB, sessions, history, worktrees, repos, secrets, **and
GitHub credentials**. All tenants share one Claude key (capped cost). Updates
propagate to every tenant with a single `deploy.sh`.

## How isolation works

Everything is driven by environment variables — **no app code change is required
for isolation** (the codebase already honors these):

| Concern | Knob | Per-tenant value |
| --- | --- | --- |
| Data dir, DB, secrets, worktrees, projects, **logs, checkpoints** | `SHEP_HOME` | `<tenantsRoot>/<id>/.shep` |
| GitHub credentials | `GH_CONFIG_DIR` | `<tenantsRoot>/<id>/gh` |
| Listen port | `--port` | unique per tenant |
| Bind host (never public) | `SHEP_BIND_HOST` | `127.0.0.1` |
| Claude key (shared) | `CLAUDE_CODE_OAUTH_TOKEN` | one value, inherited by all |

> Logs and checkpoints used to be hardcoded to `~/.shep`; they now respect
> `SHEP_HOME` too (see `getShepLogsDir` / `getCheckpointPath` /
> `getShepClustersDir`), so tenants never share agent state.

## Server layout

```
/srv/shep/
├── app/                      # this repo, cloned once, built once — shared by all tenants
├── tenants/
│   ├── companyA/{.shep,gh}   # SHEP_HOME + GH_CONFIG_DIR
│   ├── companyB/{.shep,gh}
│   └── companyC/{.shep,gh}
└── (these deploy/ scripts run from app/deploy)
```

`tenants.json` is the **single source of truth**. `gen-config.mjs` turns it into
`ecosystem.config.cjs` (pm2) and `Caddyfile` (reverse proxy), so the two can never
drift. Adding a company = one entry + regenerate.

## Prerequisites (on the server)

- Node + `pnpm`, `pm2`, `caddy`, and the GitHub `gh` CLI on `PATH`
- Your domain's DNS in Route 53 (a **wildcard** `*.shep.example.com` A-record
  pointing at this box means you never touch DNS again per tenant)
- AWS security group: allow inbound **80 + 443 only**. Tenant ports (4051+) stay
  bound to `127.0.0.1` and must NOT be reachable from the internet.

## First-time setup

```bash
# 1. Clone + build once
sudo mkdir -p /srv/shep && cd /srv/shep
git clone <this-repo> app && cd app
pnpm install --frozen-lockfile
pnpm build:release

# 2. Create your tenant config from the example
cp deploy/tenants.example.json deploy/tenants.json
#   edit deploy/tenants.json: set "domain", and for each tenant set a login
#   password hash:  caddy hash-password   → paste into "authHash"

# 3. Create each tenant's isolated dirs + GitHub login
for ID in companyA companyB companyC; do
  mkdir -p /srv/shep/tenants/$ID/{.shep,gh}
  chmod 700 /srv/shep/tenants/$ID/{.shep,gh}
  GH_CONFIG_DIR=/srv/shep/tenants/$ID/gh gh auth login   # log in as THAT company
done

# 4. Generate pm2 + Caddy configs
node deploy/gen-config.mjs

# 5. Share the Claude key (capped-cost subscription token) and start everything
export CLAUDE_CODE_OAUTH_TOKEN=...            # put this in your systemd/pm2 env for persistence
pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save

# 6. Front it with Caddy (auto-HTTPS + login)
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Each company is now at `https://<subdomain>.<domain>`, behind a login, on its own
isolated data — sharing one Claude bill.

## Add a new company later (one command)

```bash
deploy/new-tenant.sh companyD companyd 4054
```

It creates the dirs, runs `gh auth login` for that company, prompts for a login
password, appends to `tenants.json`, regenerates configs, starts the pm2 process,
and reloads Caddy. With a wildcard DNS record there's nothing else to do.

## Ship a code update to all tenants

```bash
deploy/deploy.sh
```

`git pull` → `pnpm build:release` → regenerate configs → `pm2 reload` (≈zero
downtime). Every tenant migrates its own DB on restart.

## Cost & usage

- **One shared `CLAUDE_CODE_OAUTH_TOKEN`** = a hard cost ceiling (the subscription
  price). All tenants draw from the same rate/usage pool — heavy use by one
  company is felt by the others. This is the trade-off for a capped bill.
- Want a company on its own quota? Give that tenant its own token by adding a
  `claudeToken` to its entry and extending `gen-config.mjs` to emit it in `env`
  (the design already supports per-tenant override).
- **Per-tenant usage visibility:** token counts are recorded per agent-run in each
  tenant's own DB (`<SHEP_HOME>/data`), so usage is attributable by querying each
  DB even though it isn't enforced.

## Security notes

- Whoever logs into a subdomain gets **full control of that tenant** (the app has
  no internal permission model) — keep credentials to people you trust with the box.
- Keep tenant ports bound to `127.0.0.1`; only Caddy (80/443) is public.
- The two webhook routes (`/api/webhooks/*`, `/api/whatsapp/webhook`) are left
  un-gated on purpose — they self-verify HMAC signatures.
- `tenants.json`, `Caddyfile`, and `ecosystem.config.cjs` are gitignored because
  they hold login hashes / are generated. Back up `tenants/*/.shep/data` (DBs) and
  `tenants/*/.shep/secret.key` (losing the key makes encrypted tokens unrecoverable).

## Sizing

Each tenant spawns `claude` subprocesses and git worktrees during agent runs —
CPU/memory heavy. Budget generously (e.g. `m5.xlarge`+ for 3–4 active tenants),
mount a roomy EBS volume at `/srv/shep` (worktrees + cloned repos live under each
`SHEP_HOME/repos`), and the `max_memory_restart` guard in the generated pm2 config
will recycle runaway processes.
