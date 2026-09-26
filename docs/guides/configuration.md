# Configuration

Comprehensive guide to configuring Shep AI CLI.

## Where Settings Live

Shep keeps a **single global settings record** in a SQLite database at `~/.shep/data`. There is
no JSON or YAML config file for it — settings are read and written through the `shep settings`
command group, the web UI settings page, or (internally) the `getSettings()` service.

```bash
# Inspect everything Shep currently has configured
shep settings show
shep settings show --output json
```

Set `SHEP_HOME` to move the whole Shep home directory (database, daemon state, logs) somewhere
else; the database is always `<SHEP_HOME>/data`.

The settings record groups its fields as:

| Group           | Holds                                                         |
| --------------- | ------------------------------------------------------------- |
| `agent`         | Selected AI coding agent, auth method, token                  |
| `models`        | Default model, reasoning effort, adaptive per-task model tiers |
| `user`          | Name, email, GitHub username, preferred UI language           |
| `environment`   | Default editor, shell, terminal                               |
| `system`        | System-level behaviour (auto-update, log level, …)            |
| `workflow`      | Default approval gates and push/PR behaviour for new features |
| `notifications` | Per-channel notification preferences                          |
| `worktree`      | Custom worktree create / post-create commands                 |
| `messaging`     | Telegram / WhatsApp remote-control pairing                    |
| `security`      | Security mode and policy                                      |
| `supervisor`    | Supervisor policy defaults                                    |

> The canonical field list is the TypeSpec source at `tsp/domain/entities/settings.tsp`, which is
> what the generated domain types are built from.

## The `shep settings` Command Group

Running `shep settings` with no subcommand launches the full interactive onboarding wizard
(agent + IDE + workflow).

| Command                         | What it configures                                                  |
| ------------------------------- | ------------------------------------------------------------------- |
| `shep settings`                 | Full setup wizard                                                   |
| `shep settings show`            | Print current settings (`-o, --output table\|json\|yaml`)           |
| `shep settings init`            | Reset settings to defaults (`-f, --force` to skip the confirmation) |
| `shep settings agent`           | AI coding agent and its authentication                              |
| `shep settings ide`             | Preferred IDE / editor (`--editor <name>`)                          |
| `shep settings workflow`        | Default approval gates for new features                             |
| `shep settings model`           | Default LLM model (interactive picker)                              |
| `shep settings effort`          | Default reasoning effort for new features                           |
| `shep settings adaptive-models` | Per-task adaptive model tiers                                       |
| `shep settings language`        | Display language (interactive picker)                               |
| `shep settings messaging`       | Telegram / WhatsApp remote control                                  |
| `shep settings worktree`        | Custom worktree provisioning commands                               |

`shep settings init` rewrites the whole record, so back up `~/.shep/data` first if you care about
the current values.

## Agent Configuration

The configured agent type determines which AI coding tool Shep uses for **all** operations —
feature creation, implementation, analysis. Configure it with:

```bash
# Interactive wizard
shep settings agent

# Non-interactive — --auth is REQUIRED whenever --agent is given (except for `dev`)
shep settings agent --agent claude-code --auth session
shep settings agent --agent cursor --auth session
shep settings agent --agent openrouter --auth token --token sk-xxx
```

Omitting `--auth` while passing `--agent` fails with
`--auth is required when using --agent flag`. Valid `--auth` values are `session` and `token`.

### Supported agents

The catalog at `packages/core/src/domain/shared/agent-catalog.ts` is the source of truth.

| `--agent` value | Label       | Kind | Binary         | Notes                                         |
| --------------- | ----------- | ---- | -------------- | --------------------------------------------- |
| `claude-code`   | Claude Code | CLI  | `claude`       | Default                                       |
| `kimi-code`     | Kimi Code   | CLI  | `kimi`         |                                               |
| `codex-cli`     | Codex CLI   | CLI  | `codex`        |                                               |
| `copilot-cli`   | Copilot CLI | CLI  | `copilot`      |                                               |
| `cursor`        | Cursor CLI  | CLI  | `cursor-agent` | `cursor` is the desktop editor, not the agent |
| `gemini-cli`    | Gemini CLI  | CLI  | `gemini`       |                                               |
| `cline`         | Cline       | CLI  | `cline`        |                                               |
| `openrouter`    | OpenRouter  | SDK  | —              | Requires `--auth token`                       |
| `together-ai`   | Together AI | SDK  | —              | Requires `--auth token`                       |
| `ollama`        | Ollama      | SDK  | —              | Local models, no API key                      |
| `llmproxy`      | LLM Proxy   | SDK  | —              | Local OpenAI-compatible proxy                 |
| `dev`           | Demo        | Mock | —              | Scripted executor for demos and tests         |

`aider` and `continue` exist as enum members but are marked unsupported ("Coming Soon") — they
have no executor yet.

When you run `shep feat new`, the configured agent is resolved through `AgentExecutorFactory`.
No command or component guesses or defaults the agent type.

### Authentication

- **Session** — Shep reuses the login you already have for the agent's CLI (for example an
  existing `claude` session). Nothing is stored beyond the choice itself.
- **Token** — pass `--token`, or let the wizard prompt for it. The token is stored in the
  settings record alongside the agent type.

## Model Configuration

```bash
shep settings model              # interactive picker, limited to the agent's supported models
shep feat new "…" --model <id>   # per-feature override
```

The default model for a fresh install is `claude-opus-5-5` (`DEFAULT_MODEL_ID` in
`domain/shared/default-model.ts`); a model you already chose is never changed. The picker only offers models the **configured agent**
supports, so switching agents can change which models are available.

| Agent | Model list |
| ----- | ---------- |
| Cursor CLI, Claude Code, Codex CLI, OpenRouter, Together AI | Live catalog (`IModelCatalog`), falls back to `agent-catalog.ts` |
| Kimi Code, Copilot CLI, Gemini CLI, Cline, Ollama, LLM Proxy, Demo | Hardcoded in `agent-catalog.ts` only |

### Adaptive model tiers

Adaptive selection routes each planned task to a model matching its complexity. The pinned model
is always the **ceiling** — adaptive selection may step down for simple tasks, never up.

```bash
shep settings adaptive-models --enable
shep settings adaptive-models --high <model> --medium <model> --low <model>
shep settings adaptive-models --clear     # derive every tier from the pinned model
shep settings adaptive-models --disable
```

Leaving a tier unset derives it from the pinned model's family intersected with the agent's
supported model list.

### Reasoning effort

Effort (`low`, `medium`, `high`, `xhigh`, `max`) sets how much the agent reasons per turn, which
drives cost, latency and quality. Unset means the agent's own default: Shep passes no flag.

```bash
shep settings effort                 # interactive picker
shep settings effort high            # default for new features
shep settings effort --clear         # back to the agent's own default
shep feat new "…" --effort xhigh     # per-feature override
```

The web UI has the same controls: **Settings → Agent → Reasoning effort**, and an effort picker
in the create drawer. A feature's effort is pinned on its agent run when it is created and
re-sent on every resume, approval and retry, so changing the default later does not affect
features already in flight. Agents that support effort receive it (Claude Code: `--effort`);
others ignore it.

## Workflow Defaults and Per-Feature Overrides

Approval gates decide where the agent pauses for you. They are configured globally and can be
overridden for a single feature.

```bash
# Global defaults
shep settings workflow --allow-prd --allow-plan
shep settings workflow --allow-all --pr
shep settings workflow --max-parallel 3      # 0 = unlimited

# Per-feature override, at creation time
shep feat new "Add dark mode" --allow-prd --push --pr
```

`shep settings workflow` accepts `--allow-prd`, `--allow-plan`, `--allow-merge`, `--allow-all`,
`--push` / `--no-push`, `--pr` / `--no-pr`, and `--max-parallel <n>`. Running it with no flags
opens the interactive wizard.

`shep feat new` accepts the same gate flags plus `--fast` / `--no-fast`, `--explore`,
`--model <model>`, `--parent <fid>`, `--pending`, `--no-rebase`, `--inject-skills` /
`--no-inject-skills`, `-r, --repo <path>`, `--remote <url>` and `--attach <path>` (repeatable).
Note that `--allow-all` sets only the three spec/merge gates — it does **not** imply `--push`
or `--pr`.

### Resolution order

```
CLI flag  →  Feature row in the database  →  Settings default
```

A flag passed to `shep feat new` wins for that feature. Otherwise the value stored on the Feature
is used. Otherwise the global workflow default applies. (See the `Workflow Configuration` doc
comment in `tsp/domain/entities/settings.tsp`.)

## Per-Repository Files

Shep reads two optional committed files from `<repo>/.shep/`. Both are treated as **untrusted**
input: a malformed file is logged and ignored rather than being fatal.

> There is no `.shep/config.json`. Repository-level configuration is limited to the two files
> below; everything else is global.

### `.shep/dev.json` — dev-server run config

Declares how to start this repository's dev server. Because it is committed, it survives the
throwaway worktree Shep creates per feature, which is why it takes precedence over a run plan
typed into the UI.

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

| Field            | Required | Meaning                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command`        | yes      | Verbatim command to spawn. Must be non-empty after trimming.                                                                                                                               |
| `cwd`            | no       | Working directory, repo-relative or absolute. Defaults to the repo root. **Must resolve inside the repository** (symlinks are resolved before the check) or the whole document is ignored. |
| `expectedPort`   | no       | Port the verify step probes. An out-of-range or non-integer value drops just this field.                                                                                                   |
| `language`       | no       | Informational.                                                                                                                                                                             |
| `framework`      | no       | Informational.                                                                                                                                                                             |
| `packageManager` | no       | Informational.                                                                                                                                                                             |
| `setupCommands`  | no       | Array of commands run before `command`. Non-string entries are dropped.                                                                                                                    |

Unknown keys are ignored, so the format can grow without breaking older files.

### `.shep/ownership.yaml` — ASPM ownership

Maps path globs to owners for the ASPM (application security posture management) surface. When
absent, the resolver falls back to the Application's owner.

```yaml
entries:
  - pathGlob: 'services/api/**'
    ownerId: alice
    teamId: platform
    businessUnitId: infra
  - pathGlob: 'web/**'
    ownerId: bob
```

`pathGlob` and `ownerId` are required per entry; `teamId` and `businessUnitId` are optional. An
entry missing a required field is skipped, and a file that fails to parse yields no entries at
all.

Shep also **writes** `.shep/evidence/` on a feature branch (the evidence node produces it); you do
not author that.

## Environment Variables

Shep has no `SHEP_PORT`, `SHEP_HOST`, `SHEP_API_KEY` or `SHEP_LOG_LEVEL`. The variables it
actually reads are:

| Variable                 | Effect                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SHEP_HOME`              | Overrides the Shep home directory (default `~/.shep`). The database is `<SHEP_HOME>/data`.                                              |
| `DEBUG`                  | Any non-empty value enables verbose CLI and deployment logging. It is a **plain truthy check**, not a namespace filter — use `DEBUG=1`. |
| `DEBUG_SQL`              | Any non-empty value enables verbose SQLite statement and migration logging.                                                             |
| `NEXT_PUBLIC_DEBUG`      | Enables client-side debug logging in the web UI.                                                                                        |
| `SHEP_BIND_HOST`         | Interface the daemon binds to. Defaults to `localhost`.                                                                                 |
| `SHEP_ALLOW_PUBLIC_BIND` | Set to `1` to allow `SHEP_BIND_HOST` to leave the loopback interface.                                                                   |
| `SHEP_ALLOWED_HOSTS`     | Extra `Host` header values to accept, for reverse-proxy setups.                                                                         |
| `SHEP_WEB_REQUIRE_TOKEN` | Set to `1` to require the control-center token for HTML pages too, not just API routes.                                                 |

```bash
DEBUG=1 shep feat new "Add dark mode"
DEBUG_SQL=1 shep settings show
```

`SHEP_WEB_PORT` also exists, but it is **published by** the daemon so the Next.js middleware can
reject `Host` headers naming a different port. Setting it yourself does not move the server.

There are additional `SHEP_*` variables used internally by the test suite and by mock executors
(`SHEP_INSTANCE_PATH`, `SHEP_MOCK_EXECUTOR`, `SHEP_MOCK_GATEWAY`, `SHEP_SKIP_READINESS_CHECK`,
`SHEP_SKIP_RECOVERY`, `SHEP_TEMPLATE_ROOT`, and others). They are not part of the supported
user-facing surface.

## Web UI Port

The default port is **4050**. If it is busy, Shep picks the next free port automatically. To
choose one explicitly:

```bash
shep start --port 8080
shep ui --port 4051
```

## IDE Preference

```bash
shep settings ide                      # interactive selection
shep settings ide --editor cursor
shep settings ide --editor antigravity
```

Run `shep settings ide --help` for the list of editor ids accepted on this version; it is derived
from the tool catalog, so it grows as tools are added. The saved preference is what
`shep ide <feat-id>` opens by default.

---

## Maintaining This Document

**Update when:**

- New `shep settings` subcommands or flags are added
- Default values change
- The resolution order for workflow gates changes
- New environment variables become user-facing
- The agent catalog gains or loses a supported agent

**Related docs:**

- [getting-started.md](./getting-started.md) - Initial setup
- [cli-commands.md](./cli-commands.md) - CLI command reference
- [custom-worktree-provisioning.md](./custom-worktree-provisioning.md) - `shep settings worktree` in depth
- [../architecture/settings-service.md](../architecture/settings-service.md) - How settings are loaded and cached
- [../development/dev-server-run-plan.md](../development/dev-server-run-plan.md) - `.shep/dev.json` precedence in full
- [../architecture/aspm.md](../architecture/aspm.md) - ASPM and ownership resolution
