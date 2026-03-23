export const COASTFILE_GENERATION_PROMPT = `# Coastfile Generation Prompt

You are generating a Coastfile for a software project. A Coastfile is a TOML configuration file (named \`Coastfile\`, placed at the project root) that tells Coast how to run isolated development environments using Docker-in-Docker containers.

Your goal: analyze the project and produce a correct, minimal Coastfile using best-effort defaults. Do not ask the user any questions — infer everything from the project structure, docker-compose files, and codebase conventions.

---

## Phase 1 — Analyze the Project

Gather context before writing anything.

1. **Read the project structure.** Identify the language, framework, package manager, and entry points.
2. **Check for docker-compose.yml.** If one exists, read it to extract services, ports, volumes, and environment variables. This determines whether the Coastfile uses \`compose = "./docker-compose.yml"\` or bare \`[services.*]\` blocks.
3. **Read Coast docs.** Use the built-in docs to verify schema details and understand options that apply to this project's stack:
   \`\`\`
   coast docs                                        # full doc tree
   coast docs --path coastfiles/README.md             # Coastfile reference index
   coast docs --path coastfiles/VOLUMES.md            # volume strategies
   coast search-docs "your specific question"         # semantic search
   \`\`\`

---

## Phase 2 — Apply Best-Effort Defaults

Use these heuristics to make configuration decisions automatically. Do not ask the user.

### Database & Infrastructure Strategy

Default to **isolated volumes** for all stateful services (postgres, redis, mongo, etc.). Isolated is the safest default — each Coast instance gets its own data, no cross-instance corruption risk.

Only use shared volumes or shared services if the project's configuration makes it explicitly clear (e.g., a comment or env var like \`SHARED_DB=true\`, or a README that documents shared database usage).

### Assign Strategy

Infer the assign strategy per service from the project structure:

- **Stateful services** (databases, caches, message queues) → \`"none"\`. These don't change between branches.
- **Application services with a Dockerfile** → \`"rebuild"\`. Add rebuild triggers for \`Dockerfile\` and the primary dependency manifest (\`package.json\`, \`Gemfile\`, \`requirements.txt\`, \`go.mod\`, \`Cargo.toml\`, etc.).
- **Application services without a Dockerfile** (interpreted, run via command) → \`"restart"\`.
- If the project has only one service, omit the \`[assign]\` section entirely.

### Secrets

Only add \`[secrets.*]\` entries if the project has clear evidence of required secrets — e.g., \`.env.example\`, \`docker-compose.yml\` referencing \`\${SECRET_VAR}\`, or a documented secrets setup. Use the \`env\` extractor by default, with the variable name matching what the project expects.

---

## Phase 3 — Generate the Coastfile

Write a \`Coastfile\` at the project root using only the sections the project needs. Follow these rules:

- **Minimal by default.** Only include sections that serve a purpose. Do not add empty blocks or commented-out examples.
- **Use \`compose\` when a docker-compose.yml exists.** Otherwise use \`[services.*]\` for bare processes or \`[coast.setup]\` for dependency installation.
- **Port names should be semantic** (e.g., \`web\`, \`api\`, \`db\`, \`cache\`), not generic.
- **Do not set \`worktree_dir\`.** Shep manages worktrees externally — the Coastfile should not configure worktree directories.

---

## Coastfile Schema Reference

### \`[coast]\` — Required. Project metadata.

\`\`\`toml
[coast]
name = "my-app"                  # (required) Project identifier for container/volume naming
compose = "./docker-compose.yml" # (optional) Path to docker-compose.yml
runtime = "dind"                 # (optional) "dind" (default), "sysbox", or "podman"
root = "."                       # (optional) Project root override
\`\`\`

### \`[coast.setup]\` — Optional. Customize the DinD container.

\`\`\`toml
[coast.setup]
packages = ["nodejs", "npm", "git"]   # Alpine packages to install
run = ["npm install -g pnpm"]         # Arbitrary setup commands
\`\`\`

### \`[ports]\` — Required (at least one). Logical name to port number.

\`\`\`toml
[ports]
web = 3000
api = 8080
db = 5432
\`\`\`

### \`[volumes.*]\` — Optional. Per-volume configuration.

\`\`\`toml
[volumes.postgres_data]
strategy = "isolated"                          # "isolated" (default) or "shared"
service = "db"                                 # Compose service that owns this volume
mount = "/var/lib/postgresql/data"             # Mount path inside the service container
# snapshot_source = "some_other_volume"        # (isolated only) Seed from existing volume
\`\`\`

### \`[secrets.*]\` — Optional. Secret extraction and injection.

\`\`\`toml
[secrets.db_password]
extractor = "env"              # "file", "env", "command", or "macos-keychain"
var = "DB_PASSWORD"            # extractor-specific: env var name on the host
inject = "env:DATABASE_PASSWORD"  # "env:VAR" or "file:/path/in/container"
# ttl = "1h"                   # optional expiry
\`\`\`

Extractor-specific parameters:
- \`file\`: \`path = "./path/to/secret"\`
- \`env\`: \`var = "HOST_ENV_VAR"\`
- \`command\`: \`run = "echo secret-value"\`
- \`macos-keychain\`: \`item = "keychain-item-name"\`

### \`[inject]\` — Optional. Non-secret host file/env forwarding.

\`\`\`toml
[inject]
env = ["NODE_ENV", "DEBUG"]
files = ["~/.ssh/id_ed25519", "~/.gitconfig"]
\`\`\`

### \`[shared_services.*]\` — Optional. Host-level services shared across instances.

\`\`\`toml
[shared_services.postgres]
image = "postgres:16-alpine"
ports = [5432]
volumes = ["postgres_data:/var/lib/postgresql/data"]
env = { POSTGRES_USER = "dev", POSTGRES_PASSWORD = "dev", POSTGRES_DB = "app" }
auto_create_db = true
inject = "env:DATABASE_URL"
\`\`\`

### \`[assign]\` — Optional. Branch-switch behavior.

\`\`\`toml
[assign]
default = "none"

[assign.services]
app = "rebuild"
worker = "restart"

[assign.rebuild_triggers]
app = ["Dockerfile", "package.json"]
\`\`\`

### \`[services.*]\` — Optional. Bare process services (no compose needed).

\`\`\`toml
[services.web]
command = "node server.js"
port = 3000
restart = "on-failure"         # "on-failure" or "always"
\`\`\`

---

## Phase 4 — Build to Validate

After writing the Coastfile, run \`coast build\` to validate it. If it fails, read the error, consult the docs (\`coast search-docs "<error description>"\`), fix the Coastfile, and rebuild until it succeeds.

---

## Complete Examples

### Minimal (no compose)

\`\`\`toml
[coast]
name = "my-app"

[coast.setup]
packages = ["nodejs", "npm"]

[ports]
app = 3000
\`\`\`

### Full stack with compose

\`\`\`toml
[coast]
name = "my-app"
compose = "./docker-compose.yml"

[ports]
web = 3000
db = 5432
cache = 6379

[volumes.postgres_data]
strategy = "shared"
service = "db"
mount = "/var/lib/postgresql/data"

[volumes.redis_data]
strategy = "isolated"
service = "cache"
mount = "/data"

[assign]
default = "none"

[assign.services]
app = "rebuild"

[assign.rebuild_triggers]
app = ["Dockerfile", "package.json"]
\`\`\`

### With secrets and inject

\`\`\`toml
[coast]
name = "my-app"
compose = "./docker-compose.yml"

[ports]
app = 3000

[secrets.api_key]
extractor = "env"
var = "API_KEY"
inject = "env:API_KEY"

[secrets.ssh_key]
extractor = "file"
path = "~/.ssh/id_ed25519"
inject = "file:/run/secrets/ssh_key"

[inject]
env = ["NODE_ENV"]
files = ["~/.gitconfig"]
\`\`\`

### Shared services (host-level postgres)

\`\`\`toml
[coast]
name = "my-app"
compose = "./docker-compose.yml"

[ports]
web = 3000

[shared_services.postgres]
image = "postgres:16-alpine"
ports = [5432]
volumes = ["postgres_data:/var/lib/postgresql/data"]
env = { POSTGRES_USER = "dev", POSTGRES_PASSWORD = "dev", POSTGRES_DB = "app" }
auto_create_db = true
inject = "env:DATABASE_URL"
\`\`\``;
