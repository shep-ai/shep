# Multi-Tenant Deployment (Nginx + wildcard subdomains)

Run several fully-isolated copies of Shep from **one codebase / one build**, one
process per company, behind your existing **Nginx** on `*.code.expertreg.com`,
each gated by a login.

Each tenant gets its own DB, sessions, history, worktrees, repos, secrets, **and
GitHub credentials**. All tenants share the server's single logged-in `claude`
CLI (capped cost). Updates propagate to every tenant with one `deploy.sh`.

## How isolation works

Everything is driven by environment variables — **no app code change is required**:

| Concern | Knob | Per-tenant value |
| --- | --- | --- |
| Data dir, DB, secrets, worktrees, projects, logs, checkpoints | `SHEP_HOME` | `<tenantsRoot>/<id>/.shep` |
| GitHub credentials | `GH_CONFIG_DIR` | `<tenantsRoot>/<id>/gh` |
| Listen port | `--port` | unique per tenant |
| Bind host (never public) | `SHEP_BIND_HOST` | `127.0.0.1` |
| Claude auth | the logged-in `claude` CLI (`~/.claude`) | shared by all tenants |

> **Claude needs no token.** Agents spawn the `claude` CLI, which uses its own
> login. Just run pm2 as the **same OS user** that ran `claude login`.

## `tenants.json` is the single source of truth

`gen-config.mjs` turns it into `ecosystem.config.cjs` (pm2), `shep.nginx.conf`
(server blocks), and `htpasswd/<id>.htpasswd` (logins). Adding a company = one
entry + regenerate; the configs can never drift.

## Prerequisites (on the server)

- Node + `pnpm`, `pm2`, the GitHub `gh` CLI, and `htpasswd`
  (`apache2-utils` on Debian/Ubuntu, `httpd-tools` on RHEL/Fedora)
- Nginx (you already have it) and `certbot`
- The `claude` CLI, logged in as the user pm2 will run as
- DNS: a **wildcard** `*.code.expertreg.com` A-record → this server
- A **wildcard TLS cert** for `*.code.expertreg.com` (see step 7)
- AWS security group: inbound **80 + 443 only**; tenant ports (4051+) stay on `127.0.0.1`

## First-time setup

```bash
# 1. Clone + build once
sudo mkdir -p /srv/shep && sudo chown "$USER" /srv/shep
cd /srv/shep && git clone https://github.com/Myndbooster/shep-custom.git app && cd app
pnpm install --frozen-lockfile
pnpm build:release

# 2. Tenant config
cp deploy/tenants.example.json deploy/tenants.json
#   edit "domain" if needed; for each tenant set a login hash:
#   htpasswd -nbB <subdomain> '<password>' | cut -d: -f2-   → paste into "authHash"

# 3. Per-tenant isolated dirs + GitHub logins
for ID in companyA companyB companyC; do
  mkdir -p /srv/shep/tenants/$ID/{.shep,gh}
  chmod 700 /srv/shep/tenants/$ID/{.shep,gh}
  GH_CONFIG_DIR=/srv/shep/tenants/$ID/gh gh auth login    # log in as THAT company
done

# 4. Generate configs
node deploy/gen-config.mjs

# 5. Start the tenants (pm2 must run as the claude-logged-in user)
pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save && pm2 startup        # run the printed command so they survive reboot

# 6. Install nginx config + logins
sudo mkdir -p /etc/nginx/shep
sudo cp deploy/htpasswd/*.htpasswd /etc/nginx/shep/
sudo cp deploy/shep.nginx.conf /etc/nginx/conf.d/shep.conf
sudo nginx -t && sudo systemctl reload nginx
```

## Step 7 — Wildcard TLS cert

A wildcard cert needs a DNS-01 challenge. With Route 53:

```bash
sudo certbot certonly --dns-route53 -d '*.code.expertreg.com'
# no route53 plugin? use manual DNS:
# sudo certbot certonly --manual --preferred-challenges dns -d '*.code.expertreg.com'
```

The cert lands at `/etc/letsencrypt/live/code.expertreg.com/` (matches the paths
in `tenants.json`). Certbot auto-renews it; all subdomains reuse it.

Now each company is at `https://<subdomain>.code.expertreg.com`, behind a login,
on isolated data, sharing one Claude subscription.

## Day-to-day

**Update all tenants:** `cd /srv/shep/app && deploy/deploy.sh`

**Add a company:** `deploy/new-tenant.sh companyD companyd 4054`
(creates dirs, GitHub login, password, regenerates, installs, starts, reloads —
the wildcard DNS + cert already cover the new subdomain, so zero DNS/cert work.)

## Cost & usage

- One shared `claude` login = a hard cost ceiling (your subscription). All tenants
  draw from the same rate/usage pool. Per-tenant token counts are still recorded
  in each tenant's own DB (`<SHEP_HOME>/data`), so usage is attributable per
  company by querying each DB.

## Security notes

- Anyone who logs into a subdomain gets **full control of that tenant** (no
  internal permission model) — keep credentials to people you trust with the box.
- Tenant ports stay bound to `127.0.0.1`; only nginx (80/443) is public.
- Each subdomain uses its **own** htpasswd file, so one company's login does not
  work on another's.
- Webhook routes (`/api/webhooks/*`, `/api/whatsapp/webhook`) are intentionally
  un-gated — they self-verify HMAC signatures.
- `tenants.json`, generated configs, and `htpasswd/` are gitignored (secrets).
  Back up `tenants/*/.shep/data` (DBs) and `tenants/*/.shep/secret.key`.

## Sizing

Each tenant spawns `claude` subprocesses + git worktrees during agent runs (heavy).
Budget generously, mount a roomy volume at `/srv/shep`, and the pm2
`max_memory_restart` guard recycles runaway processes.

## Your existing `code.expertreg.com → :4050`

That apex instance is independent of this setup (this only adds
`*.code.expertreg.com` subdomains). Keep it, or migrate it to a tenant later by
adding an entry with `"subdomain"` pointing at the apex and removing the old
Nginx block.
