# CLI Command Reference

## Global Options

| Option          | Description                     |
| --------------- | ------------------------------- |
| `-v, --version` | Display version number and exit |
| `-h, --help`    | Display help and exit           |

Running `shep` with no arguments starts the web UI daemon.

---

## Daemon Commands

### `shep`

Start the web UI daemon. This is the default action when no subcommand is
provided: the root command's `.action()` calls `startDaemon()` and nothing else.

`startDaemon()` spawns a detached `shep _serve` child, waits for the server to
answer, writes `daemon.json` (pid, port, start time), and then opens
`http://localhost:<port>/applications` in the browser.

**First run does not open a terminal wizard.** Onboarding is completed in the web
UI that `startDaemon()` just opened. The only CLI onboarding gate lives in
`shep feat new`, which runs the TUI wizard before creating a feature when stdin
is a TTY and onboarding is incomplete.

**Source**: `src/presentation/cli/index.ts` (default action) + `src/presentation/cli/commands/daemon/start-daemon.ts`

### `shep start`

Start the web UI as a background daemon.

**Source**: `src/presentation/cli/commands/start.command.ts`

| Option                | Description              | Default |
| --------------------- | ------------------------ | ------- |
| `-p, --port <number>` | Port number (1024-65535) | `4050`  |

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
| `--no-open`           | Do not open the browser  | —       |

**Examples**:

```bash
# Start on default port
shep ui

# Start on custom port
shep ui --port 8080

# Start without opening the browser
shep ui --no-open
```

**Behavior**:

- Starts the web UI server and prints the URL.
- Auto-increments port if the requested port is already occupied.
- Graceful shutdown on Ctrl+C.

### `shep _serve` (internal, hidden)

> **Not a user-facing command.** The name is `_serve`, with the leading
> underscore, and it is hidden from `--help` (`helpOption(false)`,
> `addHelpCommand(false)`). Do not document or script against it as `shep serve`
> — no such command exists.

The daemon child entry point. `startDaemon()` spawns it as a detached process;
it starts the web server in the foreground and boots the background watchers
(notifications, auto-archive, contributor pipeline). Run `shep start` or
`shep ui` instead.

| Option                | Description | Default |
| --------------------- | ----------- | ------- |
| `-p, --port <number>` | Port number | `4050`  |

**Source**: `src/presentation/cli/commands/_serve.command.ts`

---

## Feature Commands

### `shep feat new <description>`

Create a new feature. When stdin is a TTY and onboarding is not yet complete,
this command runs the onboarding wizard first.

**Source**: `src/presentation/cli/commands/feat/new.command.ts`

| Option                       | Description                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `-r, --repo <path>`          | Target repository (default: cwd)                                      |
| `--remote <url>`             | Remote URL to use                                                     |
| `--push`                     | Push the branch on completion                                         |
| `--pr` / `--no-pr`           | Open (or suppress) a pull request on completion                       |
| `--allow-prd`                | Auto-approve the PRD gate                                             |
| `--allow-plan`               | Auto-approve the plan gate                                            |
| `--allow-merge`              | Auto-approve the merge gate                                           |
| `--allow-all`                | Auto-approve all three spec/merge gates                               |
| `--parent <fid>`             | Set a parent feature (dependency)                                     |
| `--pending`                  | Create the feature without spawning the agent                         |
| `--fast` / `--no-fast`       | Fast mode — skip detailed planning                                    |
| `--explore`                  | Exploration mode (mutually exclusive with `--fast`)                   |
| `--model <model>`            | Pin a model for this run                                              |
| `--no-rebase`                | Skip the rebase onto the base branch                                  |
| `--inject-skills` / `--no-inject-skills` | Override the skill-injection setting                      |
| `--attach <path>`            | Attach a reference file (repeatable)                                  |

`--allow-all` sets only the three approval gates
(`allowPrd`, `allowPlan`, `allowMerge`). It does **not** imply `--push` or
`--pr`. `--model` falls back to Shep's configured default
(`settings.models.default`) when omitted.

### `shep feat ls`

List features.

**Source**: `src/presentation/cli/commands/feat/ls.command.ts`

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| `-r, --repo <path>` | Scope the listing to one repository     |
| `--include-deleted` | Include soft-deleted features           |
| `--show-archived`   | Include archived features               |

### `shep feat show <id>`

Show details of a specific feature.

**Source**: `src/presentation/cli/commands/feat/show.command.ts`

### `shep feat start <id>`

Start a pending feature (spawn the agent). `--force` starts it even when the
usual preconditions do not hold.

**Source**: `src/presentation/cli/commands/feat/start.command.ts`

### `shep feat del <id>`

Delete a feature.

**Source**: `src/presentation/cli/commands/feat/del.command.ts`

| Option           | Description                           |
| ---------------- | ------------------------------------- |
| `-f, --force`    | Skip the confirmation prompt          |
| `--no-cleanup`   | Leave the worktree and branch in place |
| `--no-close-pr`  | Leave an open PR open                 |

### `shep feat resume <id>`

Resume a stopped or failed feature agent.

**Source**: `src/presentation/cli/commands/feat/resume.command.ts`

### `shep feat review [id]`

Interactive review of a feature waiting for approval.

**Source**: `src/presentation/cli/commands/feat/review.command.ts`

### `shep feat approve [id]`

Approve a feature waiting for review.

**Source**: `src/presentation/cli/commands/feat/approve.command.ts`

### `shep feat reject [id] --reason <text>`

Reject a feature waiting for review.

**Source**: `src/presentation/cli/commands/feat/reject.command.ts`

| Option            | Description                               |
| ----------------- | ----------------------------------------- |
| `--reason <text>` | Rejection reason — **required**            |

`--reason` is a `requiredOption`: the command fails without it. There is no
`--feedback` flag.

### `shep feat logs <id>`

View feature agent logs.

**Source**: `src/presentation/cli/commands/feat/logs.command.ts`

| Option                | Description                            | Default |
| --------------------- | -------------------------------------- | ------- |
| `-f, --follow`        | Stream new lines as they arrive        | —       |
| `-n, --lines <count>` | Show only the last N lines (0 = all)   | `0`     |

### `shep feat adopt <branch>`

Adopt an existing branch as a tracked feature. `-r, --repo <path>` selects the
repository.

**Source**: `src/presentation/cli/commands/feat/adopt.command.ts`

### `shep feat archive <id>` / `shep feat unarchive <id>`

Archive a feature to hide it from the canvas, or restore an archived feature to
its previous state. `archive` accepts `-f, --force`.

**Source**: `src/presentation/cli/commands/feat/archive.command.ts`,
`src/presentation/cli/commands/feat/unarchive.command.ts`

### `shep feat feedback <id> <feedback>`

Send feedback on an exploration prototype so the agent iterates on it.

**Source**: `src/presentation/cli/commands/feat/feedback.command.ts`

### `shep feat promote <id>`

Promote an exploration feature to Regular or Fast mode (`--fast` selects Fast).

**Source**: `src/presentation/cli/commands/feat/promote.command.ts`

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

Reject a paused agent run and cancel it.

**Source**: `src/presentation/cli/commands/agent/reject.command.ts`

### `shep agent questions` (group)

The unified question/escalation inbox (spec 093, gated on the `collaboration`
feature flag). Every subcommand takes `--app <id>` for scope isolation.

| Subcommand                          | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `ls --app <id>`                     | List questions; `--feature <id>` and `--limit <n>` narrow  |
| `answer <questionId> --app <id> --answer <text>` | Record an answer (`--answered-by`, default `user:cli`) |
| `cancel <questionId> --app <id>`    | Cancel a question (`--reason`, `--cancelled-by`)           |

**Source**: `src/presentation/cli/commands/agent/questions/`

### `shep agent message send` (group)

Publish a message onto the inter-agent message bus. Requires `--app <id>`,
`--from-actor <actor>` and `--payload <json>`; `--feature`,
`--from-agent-run-id` and `--correlation-id` are optional.

**Source**: `src/presentation/cli/commands/agent/message/`

---

## Repository Commands

### `shep repo ls`

List tracked repositories.

**Source**: `src/presentation/cli/commands/repo/ls.command.ts`

### `shep repo show <id>`

Display details of a tracked repository.

**Source**: `src/presentation/cli/commands/repo/show.command.ts`

### `shep repo add`

Import a GitHub repository — clone and register it. `--url <url>` names the
repository, `--dest <path>` the clone destination.

**Source**: `src/presentation/cli/commands/repo/add.command.ts`

### `shep repo import <dir>`

Import local folders as tracked repositories in bulk. `--all` skips the
interactive picker; `--git-only` restricts the import to folders that are git
repositories.

**Source**: `src/presentation/cli/commands/repo/import.command.ts`

### `shep repo init-remote [name]`

Create a GitHub repository from the current local repo and push to it.
`--public` makes it public; `--org <name>` creates it under an organization.

**Source**: `src/presentation/cli/commands/repo/init-remote.command.ts`

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

When `--agent` is supplied and is not `dev`, `--auth` becomes required.
Valid `--agent` values are the supported members of `AgentType`
(`claude-code`, `kimi-code`, `codex-cli`, `copilot-cli`, `cursor`, `gemini-cli`,
`cline`, `openrouter`, `together-ai`, `ollama`, `llmproxy`, `dev`). `aider` and
`continue` are declared but not supported.

### `shep settings ide`

Configure the preferred IDE/editor.

**Source**: `src/presentation/cli/commands/settings/ide.command.ts`

### `shep settings workflow`

Configure default workflow behavior for new features:
`--allow-prd`, `--allow-plan`, `--allow-merge`, `--allow-all`,
`--push` / `--no-push`, `--pr` / `--no-pr`, plus the CI options.

**Source**: `src/presentation/cli/commands/settings/workflow.command.ts`

### `shep settings model`

Configure the default LLM model for agent runs.

**Source**: `src/presentation/cli/commands/settings/model.command.ts`

### `shep settings adaptive-models`

Configure per-task model tier routing (spec 110).

**Source**: `src/presentation/cli/commands/settings/adaptive-models.command.ts`

| Option            | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `--enable`        | Route each task to a model matching its complexity                |
| `--disable`       | Run every task on the pinned model                                |
| `--high <model>`  | Model for High-complexity tasks (empty string to derive)          |
| `--medium <model>`| Model for Medium-complexity tasks (empty string to derive)        |
| `--low <model>`   | Model for Low-complexity tasks (empty string to derive)           |
| `--clear`         | Remove all tier overrides and derive them from the pinned model   |

### `shep settings language`

Configure the display language. Nine locales ship under `translations/`:
`ar`, `de`, `en`, `es`, `fr`, `he`, `pt`, `ru`, `uk`.

**Source**: `src/presentation/cli/commands/settings/language.command.ts`

### `shep settings messaging`

Configure the messaging integrations (Telegram / WhatsApp routing).

**Source**: `src/presentation/cli/commands/settings/messaging.command.ts`

### `shep settings worktree`

Override how worktrees are created.

**Source**: `src/presentation/cli/commands/settings/worktree.command.ts`

| Option                       | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `--create-command <cmd>`     | Command that replaces `git worktree add`            |
| `--post-create-command <cmd>`| Command run inside each new worktree                |
| `--timeout <ms>`             | Timeout in milliseconds applied to each command     |
| `--clear`                    | Clear all overrides and use the built-in git worktree |

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

### `shep install [tool]`

Install a development tool. With no argument, lists the available tools. `--how`
prints the installation instructions without installing anything.

```bash
shep install                      # list available tools
shep install claude-code          # install Claude Code
shep install claude-code --how    # show instructions only
```

**Source**: `src/presentation/cli/commands/install.command.ts`

### `shep ide <feat-id>`

Open a feature's worktree in your IDE.

> The file is `ide-open.command.ts`, but the command it registers is
> `new Command('ide')`. **`shep ide-open` does not exist.**

**Arguments**: `<feat-id>` — the feature whose worktree to open (required).

**Options**: one boolean flag per editor, **derived at runtime** from the tool
metadata JSONs — every tool that declares an `openDirectory` entry gets a
`--<tool-id>` flag. Today that is `--vscode`, `--cursor`, `--cursor-cli`,
`--windsurf`, `--zed`, `--antigravity`, the terminals (`--warp`, `--kitty`,
`--alacritty`, `--iterm2`, `--tmux`, `--system-terminal`) and the CLI agents
(`--claude-code`, `--codex`, `--copilot`, `--gemini-cli`, `--kimi`). Run
`shep ide --help` for the list this build actually registers.

The first matching flag wins; with no flag, the command falls back to
`settings.environment.defaultEditor`.

```bash
shep ide feat-123
shep ide feat-123 --zed
```

**Source**: `src/presentation/cli/commands/ide-open.command.ts`

---

## Application Commands

`shep app` starts and manages apps. Start an app, then add features to it: every feature
created in an app's folder (`shep feat new`) attaches to that app.

| Command                      | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `shep app ls`                | List applications                                          |
| `shep app show`              | Display details of an application                          |
| `shep app new`               | Start a new app: blank (any stack; spec-driven first feature) or `--starter vite-shadcn` |
| `shep app del`               | Delete an application                                      |
| `shep app cloud-providers ls`      | List cloud deployment providers and their connection state |
| `shep app cloud-providers connect` | Connect a provider with an API token                 |
| `shep app cloud-providers github-login` | Run `gh auth login --web` and wait for completion |
| `shep app deploy start`      | Start a cloud deployment (streams progress)                |
| `shep app deploy status`     | Show the latest cloud deployment status                    |
| `shep app git create-remote` | Create a GitHub repository for the application and push    |

```bash
shep app new "A booking tool for climbing gyms"              # blank starter, spec-driven first feature
shep app new "A photo-renaming CLI" --fast                   # blank starter, first feature built directly
shep app new "Landing page for a bakery" --starter vite-shadcn  # Vite + React + Tailwind + shadcn template
cd ~/.shep/projects/<app-slug> && shep feat new "Add waitlists" # add a feature to the app
```

**Source**: `src/presentation/cli/commands/app/`

---

## Cluster Commands

`shep cluster` groups repositories and applications that ship together. Gated on
the `clusters` feature flag.

| Command                | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `shep cluster new`     | Create a new cluster                               |
| `shep cluster ls`      | List clusters                                      |
| `shep cluster show`    | Display details of a cluster                       |
| `shep cluster del`     | Delete a cluster                                   |
| `shep cluster link`    | Link a repository or application to a cluster      |
| `shep cluster unlink`  | Unlink a repository or application from a cluster  |
| `shep cluster status`  | Show live cluster status                           |

**Source**: `src/presentation/cli/commands/cluster/`

---

## Dev Server Commands

`shep dev` runs and inspects a local dev server, driven by the DevServerAgent
graph (see [../architecture/agent-system.md](../architecture/agent-system.md)).

| Command                 | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `shep dev start`        | Start the dev server and stream it until it is ready         |
| `shep dev stop`         | Stop the dev server                                          |
| `shep dev status`       | Show the dev server state and the command it runs            |
| `shep dev logs`         | Show the dev server output                                   |
| `shep dev plan show`    | Show the resolved run plan                                   |
| `shep dev plan set`     | Pin a run plan of your own                                   |
| `shep dev plan clear`   | Clear the cached run plan so the next start re-analyzes      |

A repo may also pin its own configuration in `<repo>/.shep/dev.json`. Because this
file can arrive through a Git pull, its executable settings require local consent.
Until approved, Shep ignores the file and uses the detector chain.

Run `shep dev approve --repo /absolute/path/to/repo` to review the command, working
directory, package manager, setup commands and fingerprint. After reviewing them,
repeat the command with `--fingerprint <displayed-hash>` to record approval. The
command also supports the shared `--app` and `--feature` target flags. Approval
does not execute the commands; start the server with `shep dev start` afterward.
If executable settings change between review and approval, the command refuses
the stale fingerprint. Later changes require another approval. Consent is stored
under `SHEP_HOME/approvals/`, outside the repository, for this repository path.

**Source**: `src/presentation/cli/commands/dev/`

---

## Project Management Commands

Gated on the `projects` feature flag.

### `shep project`

| Command              | Description          |
| -------------------- | -------------------- |
| `shep project new`   | Create a new project |
| `shep project ls`    | List all projects    |
| `shep project show`  | Show project details |
| `shep project del`   | Delete a project     |

### `shep item`

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `shep item new`     | Create a new work item                       |
| `shep item ls`      | List work items in a project                 |
| `shep item relate`  | Create a relation between two work items     |
| `shep item export`  | Export work items as CSV                     |

### `shep cycle`

| Command                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `shep cycle new`         | Create a new cycle                                     |
| `shep cycle ls`          | List cycles in a project                               |
| `shep cycle show`        | Show cycle details                                     |
| `shep cycle add-items`   | Add work items to a cycle                              |
| `shep cycle transfer`    | Transfer incomplete items from one cycle to another    |

### `shep intake`

| Command               | Description                                         |
| --------------------- | --------------------------------------------------- |
| `shep intake ls`      | List intake items for a project                     |
| `shep intake accept`  | Accept an intake item and convert it to a work item |
| `shep intake decline` | Decline an intake item with a reason                |

**Source**: `src/presentation/cli/commands/{project,item,cycle,intake}/`

---

## Notifications

### `shep notifications ls` (alias `shep notif ls`)

List notifications.

**Source**: `src/presentation/cli/commands/notifications/`

---

## Supervisor Commands

`shep supervisor` manages the delegated supervisor agent (spec 093), gated on
the `collaboration` feature flag. See
[../architecture/supervision.md](../architecture/supervision.md).

| Command                     | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `shep supervisor configure` | Create or update a supervisor policy            |
| `shep supervisor enable`    | Enable an existing supervisor policy            |
| `shep supervisor disable`   | Disable an existing supervisor policy           |
| `shep supervisor status`    | Show the effective supervisor policy for a scope |
| `shep supervisor approve`   | Approve a waiting agent run as the supervisor   |
| `shep supervisor reject`    | Reject a waiting agent run as the supervisor    |

**Source**: `src/presentation/cli/commands/supervisor/`

---

## Bedrock Commands

`shep bedrock` manages project-bedrock memory for an application. Gated on the
`bedrockIntegration` feature flag. Each subcommand takes `--app`.

| Command                | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `shep bedrock init`    | Enable bedrock memory for an application and run `bedrock init`     |
| `shep bedrock sync`    | Reconcile bedrock memory with git state inside the app worktree     |
| `shep bedrock ship`    | Commit bedrock memory updates inside the app worktree               |
| `shep bedrock doctor`  | Verify bedrock prerequisites (Python, pipx, bedrock binary)         |

**Source**: `src/presentation/cli/commands/bedrock/`

---

## Plugin Commands

`shep plugin` manages AI tool plugins.

| Command                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `shep plugin catalog`    | Browse available plugins from the curated catalog      |
| `shep plugin add`        | Install a plugin from catalog or custom configuration  |
| `shep plugin remove`     | Remove an installed plugin                             |
| `shep plugin list`       | List all installed plugins                             |
| `shep plugin enable`     | Enable a plugin globally                               |
| `shep plugin disable`    | Disable a plugin globally                              |
| `shep plugin configure`  | Configure plugin settings                              |
| `shep plugin status`     | Show detailed health status of a plugin                |

**Source**: `src/presentation/cli/commands/plugin/`

---

## Scheduled Workflow Commands

`shep workflow` manages scheduled workflows. Gated on the `scheduledWorkflows`
feature flag.

| Command                   | Description                            |
| ------------------------- | -------------------------------------- |
| `shep workflow create`    | Create a new workflow                  |
| `shep workflow list`      | List all workflows                     |
| `shep workflow show`      | Show workflow details                  |
| `shep workflow update`    | Update a workflow                      |
| `shep workflow delete`    | Delete a workflow                      |
| `shep workflow schedule`  | Set a cron schedule on a workflow      |
| `shep workflow enable`    | Enable a workflow schedule             |
| `shep workflow disable`   | Disable a workflow schedule            |
| `shep workflow run`       | Manually trigger a workflow            |
| `shep workflow history`   | View workflow execution history        |

**Source**: `src/presentation/cli/commands/workflow/`

---

## Security Commands

### `shep security enforce`

Evaluate repository security posture and enforce policy. Gated on the
`supplyChainSecurity` feature flag; when the flag is off the command is a no-op
that exits 0.

| Option                  | Description                                | Default |
| ----------------------- | ------------------------------------------ | ------- |
| `-r, --repo <path>`     | Repository to evaluate                     | cwd     |
| `-o, --output <format>` | Output format (`table` or `json`)          | `table` |

`SHEP_SUPPLY_CHAIN_SECURITY=false` is the CI kill-switch.

**Source**: `src/presentation/cli/commands/security.command.ts`

### `shep aspm` (group)

Application Security Posture Management — findings, campaigns, posture,
exceptions and AI-change review. Gated on the `aspm` feature flag. See
[../architecture/aspm.md](../architecture/aspm.md).

| Command                  | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `shep aspm scan`         | Run a fresh ASPM scan over the application working tree       |
| `shep aspm rescan`       | Re-scan an application — idempotent if the tree is unchanged  |
| `shep aspm ingest`       | Ingest SARIF or CycloneDX findings for an application         |
| `shep aspm findings`     | List and inspect ASPM security findings                       |
| `shep aspm campaigns`    | Manage ASPM remediation campaigns                             |
| `shep aspm posture`      | Show ASPM posture summary (workspace or per-application)      |
| `shep aspm exceptions`   | Manage ASPM risk exceptions                                   |
| `shep aspm ai-review`    | Triage AI-change risk signals                                 |

`scan` and `rescan` take `-a, --app <slug>` (required), an optional
`--stages <list>` (`sbom,sca,secrets,sast,container,iac`) and `--json`.

**Source**: `src/presentation/cli/commands/aspm/`

---

## Code Review Commands

`shep review` provides AI-powered code review for pull requests. Gated on the
`codeReview` feature flag.

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `shep review show`   | Display a completed code review    |
| `shep review list`   | List recent code reviews           |
| `shep review post`   | Post a completed review to GitHub  |

**Source**: `src/presentation/cli/commands/review.command.ts`

---

## Integration Commands

### `shep whatsapp status`

Show the WhatsApp integration configuration (spec 101): the `whatsappDispatch`
feature flag, whether the integration is enabled, the adapter, the linked number
and the count of authorized senders.

**Source**: `src/presentation/cli/commands/whatsapp/whatsapp.command.ts`

### `shep mcp`

Start the MCP server so external AI agents can drive Shep.

**Source**: `src/presentation/cli/commands/mcp.command.ts`

### `shep contributors` (CI entry points)

Entry points for the GitHub Actions contributor-pipeline workflows. These read
their input from the Actions environment, not from flags.

| Command                          | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `shep contributors groom-issue`  | Groom a newly opened GitHub issue. Reads `$GITHUB_EVENT_PATH` and `$GITHUB_REPOSITORY`; defines **no options**. |
| `shep contributors welcome-pr`   | Welcome a first-time contributor on `pull_request.opened`           |

**Source**: `src/presentation/cli/commands/contributors/`

---

## Other Commands

### `shep doctor`

Diagnose the local Shep contributor environment.

**Source**: `src/presentation/cli/commands/doctor.command.ts`

### `shep version`

Display detailed version information.

**Source**: `src/presentation/cli/commands/version.command.ts`

```
$ shep version

@shepai/cli v1.228.2
Autonomous AI Native SDLC Platform

Node:     v22.11.0
Platform: linux x64
```

Output includes package name, version (via `VersionService`), description, Node.js version, and OS platform/arch. Shep requires Node >= 22.

### `shep run <agent-name>`

Run an AI agent workflow.

**Source**: `src/presentation/cli/commands/run.command.ts`

| Option                  | Description                       | Default |
| ----------------------- | --------------------------------- | ------- |
| `-p, --prompt <prompt>` | Prompt to send to the agent       | built-in |
| `-r, --repo <path>`     | Repository to run against         | cwd     |
| `-s, --stream`          | Stream agent output as it arrives | —       |

```bash
shep run analyze-repository
shep run analyze-repository --prompt "Focus on security"
shep run analyze-repository --repo /path/to/repo --stream
```

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
