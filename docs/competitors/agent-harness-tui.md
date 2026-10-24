# Agent Harness TUIs: Multiplexers, Panes and Controls

> How the leading agent harnesses and parallel-agent managers use tmux, Zellij, WezTerm and kitty,
> and which terminal controls they offer. Written to choose what `shep tui` builds next.

Surveyed 2026-10-24. claude-squad, oh-my-pi and workmux were read at the source level; the rest
from their documentation. Gemini CLI and Crush come from secondary sources only. Conductor,
Crystal/Nimbalyst, Sculptor, Goose, Aider and Cursor CLI were left out: no solid information on
multiplexer or terminal-control features was found.

---

## Multiplexer Integration

### Claude Code: agent teams and background sessions

- **Agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). The `teammateMode`
  setting (or `--teammate-mode`) takes `in-process` (the default), `auto`, `tmux` or `iterm2`.
  - `auto` splits panes only when already inside tmux, or in iTerm2 with the `it2` CLI.
    Otherwise it stays in-process.
  - In-process mode has a panel: ↑/↓ selects, Enter views and messages a teammate, Esc
    interrupts, `x` stops.
  - Split panes are not supported in VS Code, Windows Terminal or Ghostty.
  - [docs](https://code.claude.com/docs/en/agent-teams)
- **Worktrees.** `claude -w <name>` creates `.claude/worktrees/<name>`. `--tmux` opens that
  worktree in a tmux session, using iTerm2 native panes when it can.
- **`claude agents`.** A dashboard grouped Pinned / Ready for review / Needs input / Working /
  Completed:
  - Space opens a peek panel with an inline reply.
  - Enter attaches; ← detaches.
  - Ctrl+X stops a session; Ctrl+T pins it.
  - The same sessions are reachable from the shell: `claude --bg`, `attach`, `logs`, `stop`, and
    `agents --json`.
  - [docs](https://code.claude.com/docs/en/agent-view)

### claude-squad ([source](https://github.com/smtg-ai/claude-squad/blob/main/session/tmux/tmux.go))

- **One detached tmux session per agent:**
  `tmux new-session -d -s claudesquad_<name> -c <worktree> <program>`.
- **Attach** runs `tmux attach-session` inside its own PTY, after checking `has-session`.
- **Preview** polls `tmux capture-pane -p -e -J` and hashes the output to detect changes.
- **"Waiting for input"** is detected by matching the agent's prompt text.
- **Keys:** `↵`/`o` attach, `ctrl-q` detach, `tab` preview/diff, `D` kill.

### oh-my-pi ([source](https://github.com/can1357/oh-my-pi/tree/main/packages/coding-agent/src/subprocess/terminal-launch))

- **`/fork pane|window|tab`.** The live session is read from `TMUX`, `ZELLIJ`, `STY`, CMUX,
  Herdr and Orca variables. `TERM` is never taken as proof of a live session.
- **tmux:** `split-window -h|-v [-d] -c <cwd> -t $TMUX_PANE -P -F '#{pane_id}' -- <argv>`.
  - `#` is doubled in `-c`, because tmux format-expands it.
  - A one-element command is wrapped in `env --`.
  - The returned id is checked against `%N`.
- **Zellij:** `zellij action new-pane|new-tab [--direction right] --cwd <cwd> -- <argv>`, with
  flags gated on `zellij --version`.
- **Notifications:** in tmux, the OSC sequence is wrapped in DCS passthrough and followed by a
  BEL. In Zellij, a BEL only.
- **`omp ps`:** an interactive process monitor (`list`, `info`, `logs -f`, `stop`, `kill`,
  `restart`, `--json`).

### workmux ([source](https://github.com/raine/workmux/tree/main/src/multiplexer))

- **One tmux window per worktree task**, with a configurable `panes:` layout.
- **Backend order:** `WORKMUX_BACKEND`, then `$TMUX`, `$WEZTERM_PANE`, `$ZELLIJ*`,
  `$KITTY_WINDOW_ID`, and tmux by default.
- **WezTerm:** `wezterm cli split-pane --pane-id <id> --cwd <dir> --horizontal`, plus
  `cli spawn`, `cli get-text` and `cli send-text`.
- **kitty:** `kitten @ launch --location <loc> --cwd <dir> <argv>`, plus `--type=tab` and
  `get-text`. Needs `allow_remote_control`.
- **Status:** agent hooks write it into the tmux window names (🤖 working / 💬 waiting / ✅ done).

### Others

- **agent-deck** ([GitHub](https://github.com/asheshgoplani/agent-deck)), tmux-backed:
  - Enter attaches, Ctrl+Q detaches; `/` is fuzzy search with status filters.
  - `$` opens a cost dashboard.
  - Waiting sessions are injected into the tmux status bar with jump keys.
- **ccmanager** ([GitHub](https://github.com/kbwo/ccmanager)): hosts agents in its own PTYs with
  no tmux. It passes `--teammate-mode in-process` to `claude`, so Claude's own panes do not fight
  its PTYs.
- **uzi**, **par:** one tmux session per agent.
  - uzi: `uzi broadcast`.
  - par: `par send <label|all>`, and `par control-center`, which shows every session as a tmux
    window.

## Other Controls

| Harness | Control | Detail |
| ------- | ------- | ------ |
| Codex CLI | Notifications | `tui.notification_method = auto\|osc9\|bel`, `notification_condition = unfocused\|always`, `notify` runs a command with a JSON payload ([config](https://learn.chatgpt.com/docs/config-file/config-reference)) |
| Codex CLI | Keymap, status line | `tui.keymap.<context>.<action>`, ordered `tui.status_line` items; `alternate_screen = auto` skips the alternate screen in Zellij |
| Claude Code | Terminal setup | Desktop notifications in Ghostty, kitty, iTerm2; terminal bell elsewhere; in tmux needs `allow-passthrough on` ([docs](https://code.claude.com/docs/en/terminal-config)) |
| opencode | Attach | `opencode serve` + `opencode attach <url>`; `session list --format json` ([docs](https://opencode.ai/docs/cli/)) |
| Crush | Palette | Ctrl+P command palette, Ctrl+S session switcher |
| vibe-kanban | Review | Per-task worktree, terminal and dev server; PR-style diff review with comments sent back to the agent (web) |

---

## What Shep Took (spec 143)

`shep tui` now opens a feature in a pane next to the console:

| Key | What opens | tmux | Zellij | WezTerm | kitty |
| --- | ---------- | ---- | ------ | ------- | ----- |
| `t` | Shell in the worktree, focused | `split-window -h` | `run --direction right` | `cli split-pane --right` | `@ launch --location vsplit` |
| `T` | The same, in a new window or tab | `new-window` | `action new-tab` | `cli spawn` | `@ launch --type tab` |
| `f` | `shep feat logs -f <id>`, focus stays on the console | `split-window -h -d` | `run --direction right` | `cli split-pane --right` | `@ launch --keep-focus` |
| `F` | The log, in a new window | `new-window -d` | `run --floating` | `cli spawn` | `@ launch --type tab` |

- **Detection.** Uses workmux's order, by session variable only. `SHEP_MULTIPLEXER` names a
  multiplexer or turns panes off (`none`).
- **Commands.** Argv arrays only. `#` is doubled for tmux. The pane gets the console's
  `SHEP_HOME`.
- **No multiplexer.** The console steps aside and runs the shell or log in the same terminal.
  oh-my-pi refuses in this case; Claude Code's `auto` falls back to in-process, which is the
  model followed here.
- **`/` filter.** Every word must match the name, id, repository, branch, state, phase or agent.
- **Alerts.**
  - The notification: OSC 9 in iTerm2, OSC 777 in WezTerm and Ghostty, OSC 99 in kitty, and a
    bell elsewhere.
  - tmux: DCS passthrough plus a bell. Zellij: a bell only.
  - Only features that *start* needing the user ring.
  - The window title counts the features needing the user.

## What Shep Took (specs 144–147)

| Idea (from) | Shep |
| ----------- | ---- |
| Process monitor (`omp ps`, `claude agents --json`) | `shep ps`: daemon and agent processes with CPU, memory and uptime, `--json`, `--watch`, `stop` (spec 144) |
| Command palette (Crush ctrl+p) | `ctrl+p` / `:` in `shep tui`: every command that applies, fuzzy search, its key shown; `c` copies the feature id over OSC 52 (spec 145) |
| Control center (`par control-center`) and state in window names (workmux) | `C`: a window per active feature following its log, renamed `◆` / `●` / `✗` / `✓` as its state changes (spec 146) |
| Waiting sessions in the tmux status bar (agent-deck) | The console sets `@shep_status` / `@shep_needs_you`; `shep tui --status [plain\|tmux]` (spec 146) |
| Attach and steer (claude-squad, agent-deck, `claude attach`) | `o`: the feature's agent chat in the terminal — transcript, streaming text, send, answer its questions (spec 147) |

Attach in Shep talks to the feature's interactive chat (the web Chat tab's conversation), not a
PTY: the background worker is headless and is steered at its gates.

## Not Yet Taken

- **Peek without attaching** for agents running in panes (`tmux capture-pane`): Shep's agents are
  not in panes; the log pane and the chat cover watching.
- **Keybindings file** (Codex `tui.keymap`): the palette's command table is the registry it
  would use; settings live in the database, so it needs a TypeSpec model.
- **Pass `--teammate-mode in-process` to Claude Code** when Shep owns a pane, so Claude's own
  split panes never fight Shep's — only matters if Shep starts running Claude interactively in panes.
- **Plan/PRD review overlay and diff review with line comments** (see [oh-my-pi.md](./oh-my-pi.md),
  items 3–4).
