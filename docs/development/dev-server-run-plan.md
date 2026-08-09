# Dev Server Run Plans

How shep decides what to run when you click **Start dev** (or run `shep dev start`),
how to override that decision, and where the boundaries of the deterministic
detection are.

A **run plan** is the answer to "what command starts this repository's dev server,
and in which directory?" It is resolved once per repository path, persisted in the
`dev_server_run_plans` table, and reused until the repository's config files change.

---

## Resolution tiers

`analyze.node.ts` resolves a run plan through an ordered tier chain, cheapest and
most authoritative first. Each tier's decision is written to the deployment log
stream, so the SSE trail always names the tier that won.

| Tier | Source | Behaviour |
| ---- | ------ | --------- |
| **0** | Committed `.shep/dev.json` | Re-read on **every** start, ahead of the cache. Wins over everything. |
| **1** | Persisted plan (cache) | Reused while its `configHash` matches. A `Manual` plan is reused **regardless** of drift. |
| **2** | Detector registry | The nine ecosystem detectors below. Zero agent calls, zero tokens. |
| **3** | Structured agent | Only when every detector falls through (JVM, .NET, PHP, anything unusual). |

If tier 3 is unavailable (no agent configured) **and** every detector fell through,
the start fails with an actionable message. Every ecosystem the registry covers
starts fine with no agent at all.

### Why `.shep/dev.json` sits above the cache

Run plans are keyed by on-disk path, and shep creates a fresh worktree per feature —
so a database-only override evaporates exactly when you start your next piece of
work. A committed file is durable across worktrees and shared with the team.

Placing it merely first inside the detector registry would put it *below* the cache,
where a team-wide committed override could be permanently shadowed by one teammate's
stale local `Manual` plan, with nothing on screen explaining why.

Because it is re-read every start, the file can never go stale: edit it and the next
start picks it up. The database row it writes is a *projection* of the file, not a
cache of it — it exists so `install_deps` has a row to stamp its install hash onto.

---

## `.shep/dev.json`

A small committed JSON file at `<repository root>/.shep/dev.json`. Nothing writes it,
so it is designed to be hand-authored.

```json
{
  "command": "make dev",
  "cwd": "services/api",
  "expectedPort": 8080,
  "language": "Go",
  "framework": "Echo",
  "packageManager": null,
  "setupCommands": ["go mod download"]
}
```

### Fields

| Field | Type | Required | Validation | On invalid |
| ----- | ---- | -------- | ---------- | ---------- |
| `command` | string | **yes** | Non-empty after trimming | Whole file ignored |
| `cwd` | string | no (defaults to the repository root) | Absolute, or relative to the repository root. Must be an existing directory, and must resolve **inside** the repository subtree (symlinks resolved) | Whole file ignored |
| `expectedPort` | integer | no | 1–65535 | Field dropped, rest of the file applies |
| `language` | string | no | Non-empty after trimming | Field dropped |
| `framework` | string | no | Non-empty after trimming | Field dropped |
| `packageManager` | string \| null | no | Non-empty after trimming | Field dropped |
| `setupCommands` | string[] | no (defaults to `[]`) | Non-empty strings; other entries are dropped individually | Non-array becomes `[]` |

Unknown keys are ignored, so the format can grow without breaking older files.

### Failure behaviour

The file is **untrusted input** — it arrives via `git pull` from anyone with commit
access — so it is treated exactly like agent output: validated field by field, `cwd`
confined to the repository subtree, and **never fatal**.

A missing file, unparseable JSON, a non-object document, a missing `command`, or a
`cwd` that escapes the repository each log one warning and fall through to the next
tier. Nothing here can throw or crash the dev-server graph.

### Security

The command is executed verbatim through the same spawn path as a `package.json`
script or an agent-inferred command — this introduces no execution capability shep
did not already have. The meaningful controls are the ones that prevent accidents:
a non-empty command, a `cwd` confined to the repository, and a port that is dropped
rather than coerced when out of range.

### Interaction with database overrides

When a valid `.shep/dev.json` is present it wins over a database override, so
`OverrideDevServerRunPlanUseCase` refuses to write one and returns a
`RepoConfigControlled` result instead. The web editor and `shep dev plan set` both
surface that as "a committed `.shep/dev.json` controls this repository — edit that
file". Silently accepting input that would have no effect is worse than refusing it.

---

## Detector precedence

One ordered registry, first-success-wins, in
`packages/core/src/infrastructure/services/deployment/detectors/registry.ts`. A
detector that cannot produce a command falls through rather than terminating the
chain.

| # | Ecosystem | Gate file(s) | Command produced |
| - | --------- | ------------ | ---------------- |
| 1 | `node` | `package.json` with a `dev`/`start`/`serve` script | `<pm> run <script>` (npm, bun) or `<pm> <script>` (pnpm, yarn) |
| 2 | `deno` | `deno.json`, `deno.jsonc` with a `dev`/`start`/`serve` task | `deno task <name>` |
| 3 | `make` | `Makefile`, `makefile`, `GNUmakefile` with a `dev`/`start`/`serve`/`run` target | `make <target>` |
| 4 | `python` | `manage.py`, `pyproject.toml`, `Pipfile`, `requirements.txt` | `[<runner> run ]python manage.py runserver`, `<runner> run <script>`, or `python <entry>` |
| 5 | `go` | `go.mod` plus a `package main` | `go run .` or `go run ./cmd/<name>` |
| 6 | `rust` | `Cargo.toml` with a `[package]` table | `cargo run` |
| 7 | `ruby` | `bin/rails`, or a `Gemfile` declaring `gem "rails"` | `bin/rails server` or `bundle exec rails server` |
| 8 | `elixir` | `mix.exs` | `mix phx.server` when `:phoenix` is a dependency, otherwise `mix run --no-halt` |
| 9 | `compose` | `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml` with `services:` | `docker compose up` |

`repo-config` (`.shep/dev.json`) is deliberately **absent** from the registry: it is
tier zero and must be read before the cache, which an entry here would run after.

### Why this order

**Node is first for backward compatibility, not correctness.** Every repository shep
runs today is resolved by the Node detector, and reordering would silently change
what runs for some of them. A polyglot repository where the default is wrong is what
the override tiers exist for — an explicit, visible answer beats a detector guessing.

**Compose is last** because `docker compose up` creates containers, networks and
volumes: it is the slowest and most side-effectful option and should only win when
nothing else does.

### Package-manager and runner resolution

| Ecosystem | Signal | Order |
| --------- | ------ | ----- |
| Node | Lockfile presence | `bun.lock` → `bun.lockb` → `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`, defaulting to npm |
| Python | Lockfile presence, then a `[tool.*]` header | `uv.lock` → `poetry.lock` → `Pipfile.lock` → `[tool.uv]` → `[tool.poetry]` → `Pipfile` |

A lockfile is written by the tool that actually manages the environment, so it
outranks a `[tool.*]` header that may merely carry configuration.

### Setup commands per ecosystem

| Ecosystem | `setupCommands` |
| --------- | --------------- |
| Python (uv / poetry / pipenv) | `uv sync` / `poetry install` / `pipenv install` |
| Python (no runner, `requirements.txt`) | `pip install -r requirements.txt` |
| Go | `go mod download` |
| Elixir | `mix deps.get` |
| Ruby (with a `Gemfile`) | `bundle install` |
| Node, Deno, Rust, Make, Compose | none — each toolchain resolves dependencies on first run |

### Subdirectory scan

When no detector matches the given directory, the **whole registry** is re-run
against each immediate subdirectory — for every ecosystem, not just Node, so nested
and monorepo layouts work the same way everywhere.

The scan is one level deep only, skips `node_modules`, `.git`, `.next`, `dist`,
`build`, `out`, `.cache` and every dot-directory, and stops after
`MAX_SCANNED_SUBDIRS` (50) candidates — truncation is logged rather than silent.
Single manifest reads are capped at `MAX_MANIFEST_BYTES` (256 KB).

### Adding a ninth ecosystem

One new module under `detectors/` exporting a pure `(dirPath: string) =>
DetectorResult`, plus one entry in `DETECTOR_REGISTRY`. Nothing else.

Two rules the module must follow:

1. **Gate on `existsSync` before reading.** One stat beats one failed open, and it
   is what makes fall-through deterministic.
2. **Never throw.** Any doubt — unreadable file, unparseable content, permission
   denied — returns a fall-through error so the chain continues.

### Why there is no TOML parser

`pyproject.toml` and `Cargo.toml` are read with sibling-lockfile presence plus a
line-anchored table-header/simple-key scan, not a TOML parser. Nothing shep consumes
needs one: `cargo run` is correct independent of `Cargo.toml`'s contents, and the
Python facts that matter (which runner; did the author declare a `dev`/`start`/`serve`
script) are a table header and a one-line key. A missed signal costs one agent call —
today's behaviour — while a new runtime dependency in a published CLI is permanent.

`docker-compose.yml` **is** parsed properly, with `js-yaml`, because reading `ports:`
genuinely needs structure. It was already a direct dependency.

---

## `expectedPort`

`expectedPort` drives the verify node's TCP fallback when log parsing finds no
announced URL. The failure modes are asymmetric: an **unset** port degrades safely to
log parsing, while a **wrong** port probes a socket nothing is listening on, reports
a healthy server as failed, and can trigger a remediation agent that edits working
code.

So a port is set only when it is a fact the author wrote down:

| Source | Rule |
| ------ | ---- |
| In-command flag | `--port <n>`, `--port=<n>`, `-p <n>`, `-p=<n>`, matched as whole tokens (so `--ports` and `--port-file` never match) |
| Compose `ports:` | Only when the **whole file** publishes exactly one host port. Short (`"8080:80"`, `"127.0.0.1:8080:80"`, `"8080:80/tcp"`) and long (`{ published, target }`) syntax both read |
| Framework default | Only when the framework is positively identified: Rails 3000 (`bin/rails`), Phoenix 4000 (`:phoenix` in `mix.exs`), Django 8000 (`manage.py`) |

Everything else leaves it unset. Source files and `.env` are never scanned. A Compose
stack that publishes several host ports, or one entry that cannot be read as a plain
host port, makes the whole set ambiguous rather than silently narrowing it.

---

## Overriding a run plan

Three ways, in precedence order:

1. **`.shep/dev.json`** — durable across worktrees, shared with the team. See above.
2. **Web UI** — the collapsed **Run plan** disclosure in the preview tab, with Edit
   and Re-analyze actions.
3. **CLI** — `shep dev plan show | set | clear`.

```bash
shep dev plan show --app <id>            # resolved plan, source badge, staleness
shep dev plan set --repo . -c "make dev" --cwd services/api --port 8080
shep dev plan clear --repo .             # re-analyze on the next start
```

Every target flag (`-a, --app`, `-f, --feature`, `-r, --repo`) is optional: with none
given, the current working directory is resolved to a target.

An override is persisted with `source: Manual`, seeded from the currently resolved
plan so only what you change is changed. Validation lives in the use case, never in a
presentation layer: non-empty `command`, `cwd` confined to the repository subtree,
`expectedPort` an integer in 1–65535.

### Manual plans are never auto-invalidated

A `Manual` plan is used regardless of `configHash` drift, and the remediate node will
not delete it after a failed start. An override that the heuristics can overrule is
not an override — silently discarding typed input is the worst possible outcome for
this class of feature.

Drift is *reported* instead: the surfaces show an `isStale` hint ("config files have
changed since it was set"), and Re-analyze / `shep dev plan clear` is the one-step
escape hatch. `isStale` is derived once, inside `GetDevServerRunPlanUseCase`, so the
CLI and the web disclosure agree by construction.

---

## Cache invalidation

Two independent hashes, both in
`packages/core/src/infrastructure/services/deployment/config-hash.ts`:

- **`computeConfigHash`** — fingerprints the repository's whole manifest inventory
  (`CONFIG_FILES`). A change invalidates a `Deterministic` or `Agent` plan and
  triggers re-analysis. `.shep/dev.json` is in this list for the **delete** direction:
  the committed override is re-read every start so it can never go stale itself, but
  removing it must invalidate the deterministic plan that replaces it.
- **`computeInstallHash`** — fingerprints the single strongest install signal (the
  first existing lockfile, falling back to `package.json`). A change makes
  `install_deps` re-run the plan's setup commands.

`LOCKFILES` keeps the five Node lockfiles **first, in their existing order** — that is
what keeps the install hash byte-identical for every repository shep runs today —
followed by `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements.txt`,
`Cargo.lock`, `go.sum`, `Gemfile.lock`, `mix.lock`, `deno.lock`.

`CONFIG_FILES` and the detector registry must stay in agreement: a stack the registry
can detect but the list does not fingerprint would never re-analyze when its manifest
changed, and a manifest fingerprinted here that nothing can detect just burns an agent
call on every edit.

### Accepted limitation — subdirectory manifests are not hashed

`computeConfigHash` runs against the **repository root**, while a plan's `cwd` may be
a subdirectory the one-level scan resolved to. So a plan detected in `services/api/`
does **not** invalidate when only `services/api/package.json` changes — only a change
to a root manifest re-triggers analysis.

This predates the multi-stack registry; extending the subdirectory scan to all nine
ecosystems simply makes it easier to reach. It is recorded rather than fixed because
hashing every subdirectory's manifests would multiply the hash cost on the start hot
path, which is the wrong trade for a case with a one-step manual recovery.

**Workarounds today:** Re-analyze in the web UI, `shep dev plan clear`, or commit a
`.shep/dev.json` (which is re-read every start and therefore never stale).

**Follow-up:** scope the config hash to the plan's resolved `cwd` in addition to the
repository root, so a nested project invalidates on its own manifests without hashing
the whole tree.

---

## Related

- [TDD Guide](./tdd-guide.md) — detector tests use real temp-directory fixtures, not
  `node:fs` mocks, so parsing is genuinely exercised
- [TypeSpec Guide](./typespec-guide.md) — `RunPlanSource` and `DeploymentTargetType`
  are TypeSpec enums; `domain/generated/` is never hand-edited
- [Agent System](../architecture/agent-system.md) — the structured agent tier
