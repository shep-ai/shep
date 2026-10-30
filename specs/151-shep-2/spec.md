## Problem Statement

Shep 1 grew to 56 CLI command groups, about 35 web sections, 27 feature flags, 75 use-case
areas and about 346K lines of source. New users cannot find the core loop, the pitch differs
on every surface, and npm downloads fell from 59K (March 2026) to about 7.6K a month. The
parallel-agents-in-worktrees promise is now offered by Conductor, Codex, Cursor, Claude Code,
GitHub Agent HQ, Amp and herdr. Every one of them is designed around watching an agent work.
None is designed for the moment you come back: what finished while you were away, with proof,
and a fast decision on each result. Shep 2 is that product and nothing else.

## The Contract

| Budget | Value | Rule |
| ------ | ----- | ---- |
| Things | 1 | A **task**: a GitHub issue reference or a sentence |
| States | 5 | Queued → Working → Needs you / Ready → Merged |
| Core actions | 4 | `add(task)`, `start(at?)`, `board()`, `review(id, action)` |
| Surfaces | 4 | CLI, terminal UI, Mac app, MCP — every surface calls only the 4 actions |

Adding a 5th command, a 6th state, a second web page or a 4th MCP tool requires removing one.
Shep never merges on its own: agents open draft PRs; a person presses Merge.

## Surfaces

**CLI (4 commands)**

| Command | Does |
| ------- | ---- |
| `shep` | Opens the board (terminal UI). The first run of the day prints the morning brief inline. |
| `shep add "<task>"` | Queues an issue (`#412`, a URL) or a sentence |
| `shep go [--at HH:MM]` | Starts queued tasks now, or at a time; keeps the machine awake while they run |
| `shep config` | Agent, repo, start time, parallelism |

**Terminal UI** — one board: Queued | Working | Ready (Needs you shown with `!`). Keys: arrows
move, `m` merge, `s` send back, `g` start queued. A 2-second ASCII splash on the first run of
the day (skippable, settles to a still frame). An optional watch screen for overnight: a sky
band that warms toward dawn as tasks finish, per-task activity graphs, a slow status-line
shimmer. One `--no-motion` switch turns every animation off; `NO_COLOR`, CI and
non-interactive output disable motion and color automatically.

**Mac app (SwiftUI)** — one review window sorted by verdict (Ready, Needs you, Working,
Queued), proof first (screenshot is the hero, diff one key away), single-key decisions
(`M`, `S`, `J`/`K`, `Space`). Clearing the queue shows the dawn. A Live Activity in the
Dynamic Island or menu bar shows overnight progress. A morning notification carries a
"Merge N green" action. App Intents expose "Queue issue", "Show ready PRs", "Merge all green".

**MCP (3 tools)** — `add_task`, `board`, `review`. Lets any MCP-capable agent hand work to
Shep ("give this to Shep for tonight").

## Engine

Ported from Shep 1 and trimmed: worktree per task, agent runners (any agent CLI, resolved
through a provider interface, never hardcoded), CI watch with agent fix loop, screenshot and
test proof, second-opinion code review.

New: GitHub issue intake; park on a usage limit and resume after the reset; keep the machine
awake during a shift (caffeinate / systemd-inhibit).

Adopted from herdr's Apache-2.0 work (patterns, and code where it fits, with attribution):
task state reported and consumed over OSC 7501 with screen-reading manifests as fallback and
an `explain` command; a PTY holder process separate from the daemon so upgrades and crashes do
not kill running agents; agent resume hooks for Claude Code and Codex; attach to an agent's
live session so "Send back" continues the same conversation; the reviewer as a child agent
that reports back; a client API generated from Rust types with a test that it only grows.

## Architecture

One Rust binary, `shep`: engine, overnight daemon, CLI, terminal UI (Ratatui + tachyonfx), MCP
server (rmcp). The daemon serves JSON-RPC 2.0 over a local Unix socket; the schema is published
as OpenRPC and the Swift client types are generated from it. Storage is SQLite with three
tables (tasks, runs, events). Distribution: Homebrew, a curl installer, and `npx` through an
npm wrapper with per-platform binaries. Target: core under 10K lines.

## Success Criteria

- [ ] Six real GitHub issues queued at night on a real repo produce six draft PRs by morning, each with CI green or a clear "needs you" question
- [ ] An overnight run survives a usage-limit window and a daemon restart without losing a task
- [ ] The morning review of six PRs takes under five minutes in the terminal UI and in the Mac app
- [ ] All four surfaces perform every action through the same four core calls
- [ ] `shep --help` lists exactly four commands
- [ ] First run to first draft PR on the user's own repo in under ten minutes
- [ ] Core under 10K lines; single binary; cold start and idle memory measured and reported
- [ ] `--no-motion` disables every animation; no animation runs in CI or non-interactive output

## Out of Scope

Web app beyond one review page, project management (epics, cycles, time entries, saved views),
ASPM, incidents, opportunities, discovery, feedback themes, outcomes, clusters, WhatsApp,
feature flags, plugin marketplace, multi-user teams, tmux-style pane splitting, auto-merge.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| New Rust workspace (`shep2/` or new repository) | High | All v2 code is new |
| Shep 1 (`packages/`, `src/`) | Low | Frozen at 1.x; read for porting worktree, CI-fix, agent-runner and evidence logic |
| Distribution (npm, Homebrew) | Medium | Same or new package name (open question) |
| Docs and README | Medium | One pitch everywhere: "Dependabot for your backlog" |

## Dependencies

Ports logic proven in 149 (agent activity and blocked reasons), 138 (git checkpoints), 111
(fleet circuit breaker) and 090 (AI code review). No runtime dependency on Shep 1.

## Size Estimate

**XL** - A new product: Rust core, terminal UI, MCP server and a SwiftUI app. Eight weeks:
week 1 spec and spike, weeks 2–4 core + CLI + terminal UI, weeks 4–6 Mac app + MCP, weeks 6–8
Shep 2 builds its own remaining work overnight, then launch.

---

_Generated by `/shep-kit:new-feature` — proceed with `/shep-kit:research`_
