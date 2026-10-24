## Status

- **Phase:** Research
- **Updated:** 2026-10-24

## What the surveyed tools do

The full survey is in `docs/competitors/agent-harness-tui.md`. In short:

- **workmux** detects its backend from `$TMUX`, then `$WEZTERM_PANE`, then `$ZELLIJ*`, then
  `$KITTY_WINDOW_ID`, and drives each one through its own CLI (`tmux split-window`,
  `wezterm cli split-pane`, `zellij action`, `kitten @ launch`).
- **oh-my-pi** `/fork pane|window|tab` builds argv arrays only. It doubles `#` in tmux's
  `-c`, reads the pane id back with `-P -F '#{pane_id}'`, and wraps OSC notifications in tmux
  DCS passthrough (a bare BEL in Zellij).
- **claude-squad** and **agent-deck** run each agent in a detached tmux session and attach to
  it. Shep's agents are headless workers with a log, so the log pane is the closest
  equivalent.
- **Claude Code** agent teams: `teammateMode` is `in-process | auto | tmux | iterm2`, and
  `auto` splits only when already inside tmux or iTerm2. That is the same "use a
  multiplexer when one is live, else stay in-process" rule this spec follows.

## Decisions

See `decisions` above: session-variable detection, pure argv builders, environment
passthrough, an inline fallback, and terminal-native notifications.
