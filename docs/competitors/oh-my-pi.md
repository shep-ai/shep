# oh-my-pi (omp)

> A batteries-included terminal coding agent: a fork of Mario Zechner's Pi with a full-screen TUI,
> about 80k lines of Rust natives, first-class subagents, and a live "Agent Hub" to steer them.

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **GitHub**  | [github.com/can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)       |
| **Tagline** | "A coding agent with the IDE wired in."                                  |
| **Type**    | Terminal agent (TypeScript on Bun + Rust N-API addon), SDK, RPC and ACP  |
| **Pricing** | Free. Bring your own keys or subscriptions (60+ providers)               |
| **License** | MIT (vendored `brush-core` and parts of `pi-builtins` keep their own)    |

Researched against `can1357/oh-my-pi@0b5c27a` (2026-10-22) and Shep `main@a729150` (v1.247.0).

---

## What It Is

omp is a **single agent harness**: it owns the model loop, the tools (`read`, `edit`, `bash`,
`lsp`, `debug`, `task`, `ask`, …) and the transcript. Shep is the other kind of product: it
**orchestrates** agent CLIs it does not own (Claude Code, Codex, Cursor, …) through a feature
lifecycle, many features at a time, each in its own worktree.

That difference decides what transfers. omp's tool internals (hashline edits, LSP-on-write, a
DAP debugger, in-process ripgrep, the embedded bash) live *inside* an agent, where Shep's
executors already have their own. What transfers is the **terminal surface** omp built for
watching and steering many agents at once, plus a handful of lifecycle ideas.

### Key Features

- **Full-screen TUI** on its own library (`packages/tui`, about 193k LoC): tool-call cards, inline diffs,
  streaming markdown, overlays, a status line with about 25 segments, and remappable keybindings
- **Agent Hub** (`Alt+A`): roster of every subagent with status, cost, tokens and context %, an
  inspector (current tool, lineage, worktree branch), an activity log, and *focus to steer*, kill
  or revive
- **Subagents in isolated workspaces**, returning schema-validated results
- **Plan review overlay**: approve, or refine with per-section annotations
- **`/review`** with P0–P3 findings, confidence and an overall verdict, and **`/annotate`** to
  pin line comments on a diff and send them to the agent
- **`ask` dialog**: multi-question form with previews, a recommended option, "Other", and a desktop
  notification while it waits
- **Sessions**: fuzzy picker, pinning, tree and rewind, fork into a tmux or Zellij pane, export
  and share, import from Claude Code or Codex sessions
- **`omp ps`**: a btop-style process monitor; **`omp stats`**: a local usage dashboard
- **Four entry points**: interactive TUI, `-p` one-shot, NDJSON RPC (with a `rpc-ui` mode that
  forwards dialogs to the host), and ACP for editors
- **Generated shell completions** for bash, zsh and fish, with dynamic values

---

## How Shep Compares

|                         | omp                                         | Shep                                              |
| ----------------------- | ------------------------------------------- | ------------------------------------------------- |
| **Unit of work**        | A session (one agent plus subagents)        | A feature moving through a lifecycle              |
| **Owns the agent loop** | Yes                                         | No (wraps agent CLIs via `IAgentExecutorProvider`)|
| **Terminal UI**         | Full-screen TUI, the primary surface        | Commander commands + `@inquirer` wizards only     |
| **Live multi-agent view** | Agent Hub, pinned jump list, `omp ps`     | Web only (control center, SDLC board)             |
| **Steer a running agent** | Focus in Hub and type                     | Web chat for interactive sessions; gates for feature runs |
| **Plan / PRD gate**     | Overlay with section annotations            | `@inquirer` wizard (plan/merge are placeholders)  |
| **Code review output**  | P0–P3, confidence, verdict                  | `ReviewComment` has path, line, body; no priority |
| **Workspace isolation** | CoW clones (APFS, btrfs, ZFS, overlayfs), worktree fallback | git worktree + dependency install   |
| **Usage dashboard**     | `omp stats` (tokens/s, cache rate, TTFT, errors) | `shep usage` (p50/p95, tokens, cost) + web    |
| **Shell completions**   | Generated from live command metadata        | None                                              |
| **Runtime**             | Bun + Rust addon                            | Node ≥22 + pnpm                                   |

### What We Respect

omp treats the terminal as a real application surface rather than a log. The Agent Hub solves
the exact problem Shep's terminal users have: *many agents are running, which one needs me?*
The UI is keyboard-first, every binding is remappable, and every overlay degrades on narrow
terminals.

### Where Shep Differs

omp is a better single-session coding agent. Shep runs a whole lifecycle across many features,
repos and agent providers. Today, though, a Shep user who lives in the terminal gets
print-and-exit commands and has to open the web UI to see anything live.

---

## The Library Question: Can We Reuse omp's TUI Code?

**Not directly. Its upstream can be used.**

`@oh-my-pi/pi-tui` cannot run under Node, so Shep cannot depend on it or vendor it whole:

- `package.json` declares `engines.bun >= 1.3.14` and exports `./src/index.ts`. The published npm
  package ships raw TypeScript too.
- It imports `bun:ffi` (`terminal.ts`, `ttyid.ts`, `windows-altgr.ts`), `bun:sqlite` and `bun`'s
  YAML/JSONC parsers.
- `Bun.*` globals appear in 69 files (`Bun.stringWidth` alone ×34, the core width function).
- Width, key parsing, the output pump and SIXEL all come from the Rust addon
  `@oh-my-pi/pi-natives`, with no pure-JS fallback.
- `@oh-my-pi/pi-utils` crashes on import under Node (top-level `Bun.env` loop) and loads `~/.env`
  and the project `.env` into the process as a side effect.
- About 160k of its 193k lines are omp application UI tied to `pi-ai`, `pi-agent-core` and
  `pi-wire`.

Its upstream, **`@mariozechner/pi-tui`** (Pi, by the original author), is the usable version
of the same design. It is MIT, declares `engines.node >= 20`, and ships compiled `dist/`. Its
dependencies are only `chalk`, `marked`, `mime-types` and `get-east-asian-width`, plus optional
`koffi`. Version 0.73.1 has no Bun references in `dist/`. A spike rendered `Text`, `Markdown` and a
focused `SelectList` correctly under Node 22.22 in a real PTY.

It provides `TUI`/`Container` with differential rendering, synchronized output, overlays with
anchors and percentage sizing, `Editor` (multi-line, autocomplete, kill ring), `Input`,
`SelectList`, `SettingsList`, `Markdown`, `Loader`/`CancellableLoader`, `Box`, `Image` (Kitty,
iTerm2), `KeybindingsManager`, Kitty keyboard protocol and `StdinBuffer`.

### Recommendation

| Option | Fit for Shep | Notes |
| --- | --- | --- |
| **`@mariozechner/pi-tui`** (recommended starting point) | Good | Node-native, small, the same component model omp grew from. Inline rendering keeps scrollback, which suits a chat or attach view. Port individual omp widgets (Hub roster, plan overlay, ask dialog) on top of it. |
| **Ink** (React for CLIs) | Good | Flexbox layout suits a multi-pane dashboard, and the team already writes React. Ink 8 needs React ≥19.3; Shep pins `^19.2.4`. No ready-made markdown, editor or overlay system at pi-tui's level. |
| `@oh-my-pi/pi-tui` | Not viable | Bun-only, needs Rust addon, entangled with omp's agent packages. |

Decide between the first two with a one-week spike of the feature console (below) in both. Pure-TS
pieces worth lifting from omp regardless, keeping its MIT notice and OpenTUI's notice where present:
`stdin-buffer.ts`, `mouse.ts` (SGR parsing), the overlay anchor/sizing logic, and the theme and
keybinding schemas.

---

## What Shep Should Take (TUI)

Ordered by value to a Shep user. All of it lives in `src/presentation/tui/` and reaches data only
through use cases (`code-quality.md`).

### 1. A feature console modelled on Agent Hub (highest value)

**omp:** `Alt+A` opens a roster of agents with status, cost, tokens and age. `t` switches between a
flat and a tree view, `/` filters, and `Tab` opens an inspector. An activity log has its own
filters. `Enter` *focuses* an agent: its transcript and composer take over the screen, and typing
steers it. `x` kills it, `r` revives it. (`tui/src/overlays/agent-hub.ts`, 2580 LoC;
`docs/agent-hub.md`.)

**Shep:** `shep` (or `shep tui`) opens a console where each row is a **feature**:

- Row: repo, title, phase, agent type and model, running/waiting/blocked/done, cost, elapsed, PR
  state.
- Header: totals and a "needs you" count (open questions, pending approvals).
- Inspector: lifecycle with phase timings, worktree branch, checkpoints, last activity, PR/CI.
- Actions:
  - `Enter`: attach to the agent's log or chat
  - `a` / `r`: approve or reject the gate
  - `s`: stop
  - `R`: resume
  - `o`: open in IDE
  - `d`: diff
  - `p`: open PR
- Tree mode groups features by repo and dependency, which is the terminal version of the control
  center.

**Already in core:**

| Need | Use case or port |
| --- | --- |
| Live updates | `StreamAgentEventsUseCase` (async generator: status, phase, PR, question, supervisor and message deltas) |
| Lists | `ListFeaturesUseCase`, `GetFleetOverviewUseCase`, `ListAgentQuestionInboxUseCase` |
| Actions | `StopAgentRunUseCase`, `ResumeFeatureUseCase`, `ApproveAgentRunUseCase` / `RejectAgentRunUseCase` |
| Usage | `GetUsageStatsUseCase` |

**Design decision to make first:** the interactive chat service is an in-memory singleton inside
the web daemon. Database-backed views can call use cases in-process. Attach and steer must talk to
the running daemon instead, either over its existing HTTP/SSE routes or over a small typed protocol
that both the web UI and the TUI consume. omp's `rpc-ui` mode (`docs/rpc.md`) is a good reference
for the second option.

### 2. Pinned "needs you" strip and a per-feature status line

omp keeps a compact list of live agents above the editor and a status line with segments for
model, cost, tokens, context %, git, PR and running-subagent count (`tui/src/status-line/`). For
Shep:

- **The strip** keeps the "which feature needs me" answer visible in every TUI view.
- **The status line**, shown while attached, displays feature, phase, agent, model, cost, tokens,
  PR and CI.

Context % is not tracked anywhere in Shep yet. Only the model descriptor's `contextLength` exists.

### 3. Gate overlays: plan/PRD review and the question form

- **Plan review** (`plan-review-overlay.ts`): a full-screen markdown view with a section sidebar.
  The user annotates sections, then picks *Approve* or *Refine*. Annotations become the rejection
  feedback. This replaces the placeholder `plan-review.wizard.ts` and `merge-review.wizard.ts`,
  and upgrades `prd-review.wizard.ts`.
- **Ask dialog** (`ask-dialog.ts`): multi-question form with option descriptions and previews, a
  recommended badge, "Other (type)", and a timeout that picks the recommended option. Render
  Shep's existing Decision type (`agent/questions/decision-renderer.ts`) with it, so terminal and
  web answer the same object.

### 4. Diff review with line comments

`/annotate` opens a diff and lets the user pin comments to lines, then sends them to the agent as
one feedback prompt (`annotation-overlay.ts`). In Shep this is the terminal form of the
merge-review tab: browse a feature's diff (`feat diff` today is text only), comment on lines, and
send the comments through the existing reject-with-feedback / `address-comments` flow.

### 5. Attach view: a streaming transcript of one agent

omp renders tool calls as collapsible cards with inline diffs, streaming bash output and hidden
thinking (`tool-card.ts`, `chrome/diff.ts`). Shep's web chat already normalizes executor output
into `StreamChunk` (delta, activity, interaction, turn status). Rendering those chunks in the
terminal gives `shep feat attach <id>`, with the same steer, stop and answer actions as the web
chat. Background LangGraph runs cannot take free-form messages mid-run; for them the attach view
is a richer `feat logs -f`.

### 6. `shep ps`: a process monitor

`omp ps` (`apps/ps-top.ts`, 862 LoC) is a btop-style table: `j`/`k` to select, `l` logs, `s` stop,
`x` kill, `r` restart. Shep has the same objects spread over `agent ls`, `dev status`,
`status --logs` and `~/.shep/logs`: agent workers, dev servers and the daemon. One live table
replaces four commands.

### 7. Smaller, cheap wins

- **Shell completions:** `shep completions bash|zsh|fish`, generated from the Commander tree, plus a
  hidden `__complete` for dynamic values (feature ids, repos, agent types). Template:
  `coding-agent/src/cli/completion-gen.ts` (554 LoC). Independent of the TUI work and the cheapest
  item here.
- **Terminal notifications:** Shep already sends OS notifications through `node-notifier`
  (`DesktopNotifier`). omp also emits OSC 9/777 and BEL (`desktop-notify.ts`, 193 LoC), which reach
  the user over SSH and inside tmux where `node-notifier` cannot. Add that as a second
  `IDesktopNotifier` channel.
- **Open in a pane:** `/fork pane|window|tab` detects tmux, Zellij and others and opens a new pane
  with the right command (`terminal-multiplexer.ts`). For Shep: open a feature's worktree, or its
  agent's resumed session, in a new pane.
- **Keybindings file:** action id → chord(s), `[]` to disable, plus a `?` help overlay generated
  from it (`keybindings.ts`, `docs/keybindings.md`).
- **Feature picker:** fuzzy multi-token search with current-repo / all-repos scopes and pinning
  (`session-selector.ts`), reused wherever a command needs a feature id and none was given.

---

## Worth Taking Beyond the TUI

- **Copy-on-write worktree seeding.** `crates/pi-iso` creates workspaces with APFS `clonefile`,
  btrfs/ZFS reflinks or overlayfs, and falls back to `git worktree`. Shep creates a worktree and
  then installs dependencies in it. Cloning the main checkout's `node_modules` with
  `cp -c` (macOS) or `cp --reflink=auto` (Linux) costs near zero disk and time, and needs no
  native code. This could be the largest speed-up for parallel feature start.
- **Review findings with priority and a verdict.** omp's reviewer schema: `overall_correctness`,
  explanation, confidence, and findings with `priority` P0–P3, confidence, file and line range.
  Shep's `ReviewComment` (`tsp/domain/entities/code-review.tsp`) has path, line and body only. Add
  a `ReviewPriority` TypeSpec enum and a verdict to `CodeReview`, so both the terminal and web UIs
  can sort findings and gate merges on "no P0/P1".
- **Usage metrics.** `omp stats` reports cache hit rate, cache savings, tokens/s, error rate and
  TTFT. Shep already stores cache-read and cache-creation tokens per phase, so cache rate and cache
  savings can be added to `shep usage` with no new data.
- **omp as an agent type.** `omp acp` speaks the Agent Client Protocol, and Shep has a generic ACP
  executor (`common/executors/acp/`). Adding omp should mostly be an `AGENT_CATALOG` row, and it
  would bring omp's 60+ providers to Shep users.
- **`/loop --until '<cmd>'`.** Re-run a prompt until a shell condition holds (for example "until
  tests pass"). Close to Shep's CI fix loop and worth checking against it.

## What Shep Should *Not* Take

- **`@oh-my-pi/pi-tui` or `pi-natives` as dependencies.** Bun-only, Rust addon, about 190k lines
  coupled to omp's agent stack.
- **Agent-internal tooling.** Hashline edits, LSP-on-write, DAP debugging, the embedded bash,
  `ast_edit`, in-process grep. These belong to the agent; Shep's executors already bring their own.
- **Loop-coupled session features.** Tree, rewind, compaction, `/fresh`, `/shake`, approval mode,
  advisor, vibe mode, memory, magic keywords. They assume omp owns the transcript. Rewind is the
  one exception: re-expressed over Shep's hidden-ref checkpoints ("rewind feature to step N") it
  is a reasonable later item.
- **Collab relay.** Shep already has a web UI. Borrow only the idea of printing a QR code for the
  local web UI URL.
- **The 60-provider router and 23 web-search backends.** Out of scope for an orchestrator. ACP
  integration (above) brings them in for free.

---

## Suggested Sequence

Each step starts with `/shep-kit:new-feature`.

1. **Shell completions** and **terminal notifications**. Small, independent, and useful now.
2. **TUI foundation spike.** Choose pi-tui or Ink by building the feature console's roster
   read-only on `StreamAgentEventsUseCase`. Decide the daemon protocol for attach and steer. Rewrite
   `docs/tui/architecture.md`, which currently defines the TUI as wizards only.
3. **Feature console**: roster, inspector, actions, needs-you strip.
4. **Gate overlays**: plan/PRD review with annotations, and the question form on the Decision type.
5. **Attach view and diff review with line comments.**
6. **`shep ps`, feature picker, keybindings file.**

In parallel, outside the TUI: CoW dependency seeding, the review priority schema, and the omp ACP
agent row.

## Licensing

omp is MIT (© 2025 Mario Zechner, © 2025–2026 Can Bölük, © 2026 Stencil Labs). Any copied file
keeps that notice. `tui/src/stdin-buffer.ts` and `keys.ts` also credit OpenTUI (MIT), which must be
kept. `crates/vendor/brush-core` and parts of `crates/pi-builtins` are under other licenses: see
`THIRD-PARTY-NOTICES.txt` before taking anything from the Rust side. `@mariozechner/pi-tui` is MIT.

---

_Sources: [GitHub](https://github.com/can1357/oh-my-pi), [omp.sh](https://omp.sh),
[pi-mono](https://github.com/badlogic/pi-mono), `docs/agent-hub.md`, `docs/tui-core-renderer.md`,
`docs/rpc.md`, `packages/tui/src`, npm metadata for `@oh-my-pi/pi-tui` and `@mariozechner/pi-tui`._
