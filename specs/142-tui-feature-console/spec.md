## Problem Statement

Shep's terminal surface prints and exits. A user running several features has to chain
`feat ls`, `feat show`, `feat logs -f`, `agent questions ls` and `feat approve` to learn which
feature needs them, or open the web UI. Everything live (the control center, the SDLC board,
notifications) exists only in the browser. `docs/tui/` defines the TUI as one-shot `@inquirer`
wizards, and `tests/e2e/tui/` holds a placeholder waiting for a real TUI.

The status a feature shows is also derived twice, in presentation code: `feat ls`
(`formatStatus`) and the web (`deriveNodeState`). A console would be the third copy.

## Success Criteria

- [ ] `shep tui` opens a full-screen console (alternate screen) and restores the terminal on exit
- [ ] Every non-archived feature is a row showing state, phase, agent, cost and elapsed time,
      refreshed every 2 seconds without flicker
- [ ] Features waiting on an approval gate or an open question appear in a "needs you" strip
      and sort first
- [ ] `a` approves, `r` rejects with typed feedback, `s` stops (after `y` confirm), `R` resumes,
      `l` tails the agent log; each key is offered only when the core says the action applies
- [ ] Feature state is derived once, in core (`deriveFeatureState` + `FeatureState` TypeSpec
      enum); the web's `deriveNodeState` delegates to it with unchanged behaviour
- [ ] An e2e test drives `shep tui` in a real pseudo-terminal against a mock-executor feature
      and approves it from the keyboard

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/common/enums/` | Medium | New `FeatureState` and `FeatureConsoleAction` enums |
| `packages/core/src/domain/shared/` | Medium | One feature-state derivation and action rules |
| `packages/core/src/application/use-cases/feature-console/` | High | Snapshot, action and log-tail use cases |
| `ILogFileStore` + `FileSystemLogFileStore` | Low | `readTail` for the log pane |
| `src/presentation/tui/feature-console/` | High | The console itself, on pi-tui |
| `src/presentation/cli/commands/tui.command.ts` | Low | Thin command wiring use cases to the console |
| Web `derive-feature-state.ts` | Low | Delegates to core, mapping `queued` to `pending` |
| `translations/*/tui.json` | Low | Console strings in all nine locales |
| `docs/tui/`, `docs/cli/commands.md` | Low | The TUI is no longer wizards only |

## Dependencies

- `@mariozechner/pi-tui` 0.73.1 (MIT, Node >= 20): differential renderer, key parsing, `Input`
- `@xterm/headless` (dev): terminal emulator for e2e screen assertions
- Existing use cases: `ListFeaturesUseCase`, `ListAgentQuestionInboxUseCase`,
  `ApproveAgentRunUseCase`, `RejectAgentRunUseCase`, `StopAgentRunUseCase`,
  `ResumeFeatureUseCase`, `GetWorkerLogPathUseCase`

## Out of Scope

Steering a running agent with free text, diff review, plan/PRD overlays and a `shep ps` monitor
(items 3-6 of the oh-my-pi analysis). Each needs its own spec.

## Size Estimate

**L** - one TypeSpec change, a domain extraction with a web call-site migration, three use
cases, a new terminal UI on a new library, nine locales, and a PTY-driven e2e test.
