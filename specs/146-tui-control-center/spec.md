## Problem Statement

Spec 143 opens one pane at a time, and each split narrows the console. Watching five running
features means five key presses and five cramped panes. `par control-center` and workmux
give every task its own window and put its state in the window name, so the multiplexer's
own window list becomes the dashboard. agent-deck puts waiting sessions in the tmux status
bar, visible from any window.

## Success Criteria

- [ ] `C` (and the palette) opens one window per active feature that has a run and no
      window yet from this console; each follows the feature's agent log
- [ ] Active means not done, archived or being deleted; features without a run are skipped
- [ ] Window names read `<state symbol> <feature name>` and change when the state changes
      (tmux, WezTerm, kitty; Zellij cannot rename an unfocused pane)
- [ ] Pressing `C` again opens windows only for features that have none
- [ ] Inside tmux the console sets `@shep_status` (styled, for status-right) and
      `@shep_needs_you` (a number) whenever they change
- [ ] `shep tui --status` prints one line (`◆ 2 need you · ● 3 running`), `--status tmux`
      with tmux styles; it needs no TTY and exits 0
- [ ] Without a multiplexer `C` explains it needs one; nothing is opened
- [ ] An e2e test in a real tmux server checks windows, names and the status options

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `ITerminalPaneLauncher` + adapter | Medium | `open` returns the window id; `renameWindow`; `publishStatus` |
| `OpenFeaturePaneUseCase` | Low | Optional title; returns the window id |
| `OpenControlCenterUseCase`, `UpdateMultiplexerStatusUseCase` | Medium | New use cases |
| `domain/shared/feature-state.ts` | Low | `isActiveFeatureState` |
| `src/presentation/tui/feature-console/` | Medium | `C`, window tracking, status publishing, status segment |
| `tui.command.ts` | Low | `--status [plain|tmux]` |
| translations, docs | Low | Nine locales; tmux.conf snippet |

## Dependencies

- Spec 143's launcher, builders and pane use case

## Out of Scope

Jump keys to a feature's window from the status bar (tmux's own window list and
`select-window` already do this once every feature has a window). Restoring windows after the
console restarts (the console only renames windows it opened).

## Size Estimate

**L** - port extension with three multiplexers, two use cases, console wiring, a CLI mode, an
e2e test in tmux.
