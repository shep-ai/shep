# CLI Command Reference

## Global Options

| Option          | Description                     |
| --------------- | ------------------------------- |
| `-v, --version` | Display version number and exit |
| `-h, --help`    | Display help and exit           |

Running `shep` with no arguments starts the web UI daemon (or runs onboarding on first launch).

---

## Daemon Commands

### `shep`

Start the web UI daemon (or run the onboarding wizard on first launch). This is the default action when no subcommand is provided.

**Source**: `src/presentation/cli/index.ts` (default action) + `src/presentation/cli/commands/daemon/start-daemon.ts`

### `shep start`

Start the web UI as a background daemon.

**Source**: `src/presentation/cli/commands/start.command.ts`

### `shep stop`

Stop the running web UI daemon.

**Source**: `src/presentation/cli/commands/stop.command.ts`

### `shep restart`

Restart (or start) the web UI daemon.

**Source**: `src/presentation/cli/commands/restart.command.ts`

### `shep status`

Show status and metrics of the running daemon.

**Source**: `src/presentation/cli/commands/status.command.ts`

### `shep ui`

Start the web UI in foreground (interactive, non-daemon mode).

**Source**: `src/presentation/cli/commands/ui.command.ts`

**Options**:

| Option                | Description              | Default |
| --------------------- | ------------------------ | ------- |
| `-p, --port <number>` | Port number (1024-65535) | `4050`  |

**Examples**:

```bash
# Start on default port
shep ui

# Start on custom port
shep ui --port 8080
```

**Behavior**:

- Starts the web UI server and prints the URL.
- Auto-increments port if the requested port is already occupied.
- Graceful shutdown on Ctrl+C.

### `shep serve` (hidden)

Internal command used by the daemon to start the web server in a child process. Hidden from `--help`.

**Source**: `src/presentation/cli/commands/_serve.command.ts`

---

## Feature Commands

### `shep feat new`

Create a new feature.

**Source**: `src/presentation/cli/commands/feat/new.command.ts`

### `shep feat ls`

List all features.

**Source**: `src/presentation/cli/commands/feat/ls.command.ts`

### `shep feat show`

Show details of a specific feature.

**Source**: `src/presentation/cli/commands/feat/show.command.ts`

### `shep feat del`

Delete a feature.

**Source**: `src/presentation/cli/commands/feat/del.command.ts`

### `shep feat resume`

Resume a paused or blocked feature.

**Source**: `src/presentation/cli/commands/feat/resume.command.ts`

### `shep feat review`

Review a feature (triggers merge review).

**Source**: `src/presentation/cli/commands/feat/review.command.ts`

### `shep feat approve`

Approve a feature.

**Source**: `src/presentation/cli/commands/feat/approve.command.ts`

### `shep feat reject`

Reject a feature.

**Source**: `src/presentation/cli/commands/feat/reject.command.ts`

### `shep feat logs`

View logs for a feature.

**Source**: `src/presentation/cli/commands/feat/logs.command.ts`

---

## Agent Commands

### `shep agent ls`

List all agent runs.

**Source**: `src/presentation/cli/commands/agent/ls.command.ts`

### `shep agent show`

Show details of a specific agent run.

**Source**: `src/presentation/cli/commands/agent/show.command.ts`

### `shep agent stop`

Stop a running agent.

**Source**: `src/presentation/cli/commands/agent/stop.command.ts`

### `shep agent logs`

View agent run logs.

**Source**: `src/presentation/cli/commands/agent/logs.command.ts`

### `shep agent delete`

Delete an agent run record.

**Source**: `src/presentation/cli/commands/agent/delete.command.ts`

### `shep agent approve`

Approve an agent action.

**Source**: `src/presentation/cli/commands/agent/approve.command.ts`

### `shep agent reject`

Reject an agent action.

**Source**: `src/presentation/cli/commands/agent/reject.command.ts`

---

## Repository Commands

### `shep repo ls`

List tracked repositories.

**Source**: `src/presentation/cli/commands/repo/ls.command.ts`

### `shep repo show`

Show details of a specific repository.

**Source**: `src/presentation/cli/commands/repo/show.command.ts`

---

## Session Commands

### `shep session ls`

List sessions.

**Source**: `src/presentation/cli/commands/session/ls.command.ts`

### `shep session show`

Show details of a specific session.

**Source**: `src/presentation/cli/commands/session/show.command.ts`

---

## Settings Commands

### `shep settings`

Launch the full setup wizard (agent + IDE + workflow). Running `shep settings` without a subcommand launches the onboarding wizard interactively.

**Source**: `src/presentation/cli/commands/settings/index.ts`

### `shep settings show`

Display current settings.

**Source**: `src/presentation/cli/commands/settings/show.command.ts`

**Options**:

| Option                  | Description                            | Default |
| ----------------------- | -------------------------------------- | ------- |
| `-o, --output <format>` | Output format: `table`, `json`, `yaml` | `table` |

**Examples**:

```bash
# Table format (default)
shep settings show

# JSON format
shep settings show --output json

# YAML format (short flag)
shep settings show -o yaml
```

**Table output** renders four sections (Models, User, Environment, System) followed by database metadata (path, file size). Optional user fields show `(not set)` when null.

**JSON/YAML output** prints the raw Settings object without database metadata.

**Data source**: Reads from the in-memory settings singleton via `getSettings()`.

**Error handling**: Catches errors, prints via `messages.error()`, sets `process.exitCode = 1`.

### `shep settings init`

Reset settings to defaults. Creates a fresh `Settings` object from `createDefaultSettings()`, resets the in-memory singleton, and re-initializes it.

**Source**: `src/presentation/cli/commands/settings/init.command.ts`

**Options**:

| Option        | Description              |
| ------------- | ------------------------ |
| `-f, --force` | Skip confirmation prompt |

**Examples**:

```bash
# With confirmation prompt
shep settings init

# Skip confirmation
shep settings init --force
shep settings init -f
```

**Behavior**:

- Without `--force`: Prints a warning about data loss, prompts `Are you sure? (y/N):`. Only `y` (case-insensitive) confirms. EOF on stdin resolves to `false` (safe default).
- With `--force`: Skips confirmation, resets immediately.
- On success: Prints `messages.success('Settings initialized to defaults.')`.
- On cancel: Prints `messages.info('Operation cancelled.')`.

**Data flow**: `createDefaultSettings()` -> `resetSettings()` -> `initializeSettings(newSettings)`.

**Error handling**: Same pattern as `settings show`.

### `shep settings agent`

Configure AI coding agent.

**Source**: `src/presentation/cli/commands/settings/agent.command.ts`

**Options**:

| Option            | Description                       |
| ----------------- | --------------------------------- |
| `--agent <type>`  | Agent type (e.g. claude-code)     |
| `--auth <method>` | Auth method: `session` or `token` |
| `--token <key>`   | API token for the agent           |

**Examples**:

```bash
# Interactive wizard
shep settings agent

# Non-interactive with flags
shep settings agent --agent claude-code --auth session
```

**Behavior**:

- Without flags: Launches an interactive wizard that guides through agent selection, authentication method, and token entry.
- With flags: Runs non-interactively using the provided values.

### `shep settings ide`

Configure preferred IDE.

**Source**: `src/presentation/cli/commands/settings/ide.command.ts`

### `shep settings workflow`

Configure workflow defaults.

**Source**: `src/presentation/cli/commands/settings/workflow.command.ts`

### `shep settings model`

Configure default LLM model.

**Source**: `src/presentation/cli/commands/settings/model.command.ts`

---

## Fleet Commands

Manage and monitor a fleet of parallel agents. Every count is derived at query time from the
`features`, `agent_runs`, and `agent_questions` tables (spec 111), so nothing has to be
reconciled after a crash.

### `shep fleet status`

Show aggregate fleet health: total features, cruising, queued, attention needed, and failed.
Also reports whether the circuit breaker has tripped — 4 consecutive failed agent runs, or a
failure rate above 25% across at least 4 finished runs, within a rolling 15-minute window.

**Source**: `src/presentation/cli/commands/fleet/status.command.ts`

```
$ shep fleet status

  === Shep Fleet Health ===
  Total Features:     52
  ✓ Cruising:          42
  • Queued:            5
  ⚠ Attention Needed:  3
  ✗ Failed:            2

  ✓ Circuit Breaker: Normal
```

| Option          | Description                            |
| --------------- | -------------------------------------- |
| `--repo <path>` | Scope the fleet to one repository path |

### `shep fleet triage`

List only the exceptions that need a human, ordered P1 (approval gates, blocking questions),
P2 (failed runs, merge conflicts, failing CI), then P3 (advisory warnings). Healthy features
are omitted.

**Source**: `src/presentation/cli/commands/fleet/triage.command.ts`

| Option          | Description                            |
| --------------- | -------------------------------------- |
| `--repo <path>` | Scope the feed to one repository path  |

### `shep fleet approve`

Batch-approve features waiting on approval gates. Candidates are approved sequentially so one
conflicted feature cannot block the rest of the batch; the summary reports per-feature failures.

**Source**: `src/presentation/cli/commands/fleet/approve.command.ts`

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `--all`          | Approve every feature currently waiting at a gate     |
| `--gate <type>`  | Restrict approval to one gate: `prd`, `plan`, `merge` |

At least one of `--all` or `--gate` is required, so a bare `shep fleet approve` can never
approve anything by accident.

> **Not implemented yet**: `shep fleet retry`, `shep fleet pause` / `resume`, and the
> `--low-risk` filter. See `specs/111-fleet-control-plane/tasks.yaml` for the remaining work.

---

## Tools Commands

### `shep tools list`

List all available development tools with their installed status.

**Source**: `src/presentation/cli/commands/tools.command.ts`

### `shep install`

Install a development tool.

**Source**: `src/presentation/cli/commands/install.command.ts`

### `shep ide-open`

Open the IDE for a repository.

**Source**: `src/presentation/cli/commands/ide-open.command.ts`

---

## Other Commands

### `shep version`

Display detailed version information.

**Source**: `src/presentation/cli/commands/version.command.ts`

```
$ shep version

@shepai/cli v0.1.0
Autonomous AI Native SDLC Platform

Node:     v20.10.0
Platform: linux x64
```

Output includes package name, version (via `VersionService`), description, Node.js version, and OS platform/arch.

### `shep run`

Run an AI agent workflow.

**Source**: `src/presentation/cli/commands/run.command.ts`

### `shep upgrade`

Upgrade Shep CLI to the latest version.

**Source**: `src/presentation/cli/commands/upgrade.command.ts`

---

## Adding a New Command

1. Create `src/presentation/cli/commands/<name>.command.ts` (or `<group>/<name>.command.ts` for subcommands).
2. Export `create<Name>Command(): Command` factory function.
3. Add options, help text, and action handler following the patterns above.
4. Register in `index.ts` via `program.addCommand(create<Name>Command())`.
5. For command groups, create an `index.ts` that uses `.addCommand()` to compose subcommands.
6. Use `messages.*` for feedback, `OutputFormatter` for multi-format output, `process.exitCode = 1` for errors.
