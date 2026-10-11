# CLI Documentation

Reference documentation for the Shep AI CLI presentation layer.

## Overview

The CLI is built with [Commander.js](https://github.com/tj/commander.js/) and follows Clean Architecture principles. Commands live in `src/presentation/cli/commands/`, UI utilities in `src/presentation/cli/ui/`, and the entry point is `src/presentation/cli/index.ts`.

Bootstrap initializes the DI container (database + migrations), loads settings into the singleton, initializes i18n for the CLI and TUI layers, then configures Commander and parses arguments. The default action (no subcommand) starts the web UI daemon and opens it in the browser — onboarding happens there, in the web UI, not in the terminal. (`shep feat new` has a separate TTY-only onboarding gate of its own.)

## Documents

| Document                               | Description                                                          |
| -------------------------------------- | -------------------------------------------------------------------- |
| [architecture.md](./architecture.md)   | Command structure, file organization, DI integration, error handling |
| [design-system.md](./design-system.md) | Colors, symbols, formatters, messages, output formats, tables        |
| [commands.md](./commands.md)           | **Full command reference** — every command group, with usage examples |

## Quick Reference

### File Layout

```
src/presentation/cli/
  index.ts                          # Entry point, bootstrap()
  commands/
    version.command.ts              # shep version
    run.command.ts                  # shep run
    ui.command.ts                   # shep ui
    upgrade.command.ts              # shep upgrade
    start.command.ts                # shep start (daemon)
    stop.command.ts                 # shep stop (daemon)
    restart.command.ts              # shep restart (daemon)
    status.command.ts               # shep status (daemon)
    _serve.command.ts               # shep _serve (hidden, internal daemon child)
    install.command.ts              # shep install
    ide-open.command.ts             # shep ide  <- file name != command name
    tools.command.ts                # shep tools (group)
    doctor.command.ts               # shep doctor
    review.command.ts               # shep review (group)
    security.command.ts             # shep security (group)
    mcp.command.ts                  # shep mcp
    log-viewer.ts                   # Log viewing utility (not a command)
    settings/                       # shep settings (group; bare `settings` = wizard)
    feat/                           # shep feat (group)
    agent/                          # shep agent (group, incl. message/ + questions/)
    repo/                           # shep repo (group)
    session/                        # shep session (group)
    app/                            # shep app (group, incl. deploy/ git/ cloud-providers/)
    cluster/                        # shep cluster (group)
    dev/                            # shep dev (group, incl. plan sub-group)
    project/                        # shep project (group)
    item/                           # shep item (group)
    cycle/                          # shep cycle (group)
    intake/                         # shep intake (group)
    notifications/                  # shep notifications (group, alias `notif`)
    supervisor/                     # shep supervisor (group)
    bedrock/                        # shep bedrock (group)
    contributors/                   # shep contributors (group)
    whatsapp/                       # shep whatsapp (group)
    aspm/                           # shep aspm (group)
    plugin/                         # shep plugin (group)
    workflow/                       # shep workflow (group)
    fleet/                          # shep fleet (group)
    daemon/
      start-daemon.ts              # Daemon start logic (spawns `shep _serve`)
      stop-daemon.ts               # Daemon stop logic
  ui/
    index.ts                       # Barrel export
    colors.ts                      # Semantic color palette (picocolors)
    symbols.ts                     # Unicode symbols with ASCII fallbacks
    formatters.ts                  # Text formatting utilities (fmt)
    messages.ts                    # Pre-styled message functions
    output.ts                      # OutputFormatter (table/json/yaml)
    tables.ts                      # TableFormatter (cli-table3)
    spinner.ts                     # Terminal spinner
    list-view.ts                   # List rendering utilities
    detail-view.ts                 # Detail view rendering
    install-messages.ts            # Tool installation messages
```

### Command Summary

A frequently-used selection. The full surface — 36 top-level commands and groups
— is documented in [commands.md](./commands.md).

| Command                      | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `shep`                       | Start the web UI daemon and open it in the browser        |
| `shep start`                 | Start the web UI as a background daemon                   |
| `shep stop`                  | Stop the running daemon                                   |
| `shep restart`               | Restart the daemon                                        |
| `shep status`                | Show daemon status and metrics                            |
| `shep ui`                    | Start web UI in foreground                                |
| `shep --version` / `-v`      | Version number only                                       |
| `shep version`               | Detailed version info (name, description, Node, platform) |
| `shep feat new`              | Create a new feature                                      |
| `shep feat ls`               | List all features                                         |
| `shep feat show`             | Show feature details                                      |
| `shep feat del`              | Delete a feature                                          |
| `shep feat resume`           | Resume a paused feature                                   |
| `shep feat review`           | Review a feature                                          |
| `shep feat approve`          | Approve a feature                                         |
| `shep feat reject`           | Reject a feature                                          |
| `shep feat logs`             | View feature logs                                         |
| `shep feat checkpoints`      | List the git checkpoint taken after each step             |
| `shep feat diff`             | Show what a step changed, or compare two steps            |
| `shep feat restore`          | Roll the feature's worktree back to a checkpoint          |
| `shep agent ls`              | List agent runs                                           |
| `shep agent show`            | Show agent run details                                    |
| `shep agent stop`            | Stop an agent                                             |
| `shep agent logs`            | View agent logs                                           |
| `shep agent delete`          | Delete an agent run                                       |
| `shep agent approve`         | Approve an agent action                                   |
| `shep agent reject`          | Reject an agent action                                    |
| `shep repo ls`               | List repositories                                         |
| `shep repo show`             | Show repository details                                   |
| `shep session ls`            | List sessions                                             |
| `shep session show`          | Show session details                                      |
| `shep settings`              | Launch full settings wizard                               |
| `shep settings show`         | Display settings (default: table)                         |
| `shep settings show -o json` | Display settings as JSON                                  |
| `shep settings show -o yaml` | Display settings as YAML                                  |
| `shep settings init`         | Reset settings to defaults (with confirmation)            |
| `shep settings init -f`      | Reset settings without confirmation                       |
| `shep settings agent`        | Configure AI agent                                        |
| `shep settings ide`          | Configure preferred IDE                                   |
| `shep settings workflow`     | Configure workflow defaults                               |
| `shep settings model`        | Configure default LLM model                               |
| `shep settings language`     | Configure display language                                |
| `shep settings adaptive-models` | Configure per-task model tier routing                  |
| `shep tools list`            | List available tools                                      |
| `shep install`               | Install a development tool                                |
| `shep ide <feat-id>`         | Open a feature worktree in your IDE                       |
| `shep run <agent-name>`      | Run an AI agent workflow                                  |
| `shep upgrade`               | Upgrade Shep CLI                                          |
| `shep doctor`                | Diagnose the local Shep contributor environment           |
