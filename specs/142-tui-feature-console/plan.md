## Status

- **Phase:** Planning
- **Updated:** 2026-10-24

## Architecture Overview

```
shep tui (CLI command, thin)
  │ resolves use cases from the container, checks for a TTY
  ▼
runFeatureConsole(deps)            src/presentation/tui/feature-console/
  ├─ TUI(FullscreenTerminal(ProcessTerminal))      pi-tui renderer, alt screen
  ├─ FeatureConsoleView (Component)                state: rows, selection, mode
  │     render(width) → header · needs-you strip · roster · inspector|log · key bar
  └─ poll every 2s ──► GetFeatureConsoleSnapshotUseCase ──┐
     keys a/r/s/R ───► RunFeatureConsoleActionUseCase ───┤  packages/core/src/application/
     key l ──────────► GetFeatureLogTailUseCase ─────────┘  use-cases/feature-console/
                            │
                            ├─ ListFeaturesUseCase (reconciles crashed runs)
                            ├─ IAgentRunRepository.findByIds
                            ├─ IPhaseTimingRepository.findByRunIds
                            ├─ ListAgentQuestionInboxUseCase(status: pending)
                            ├─ IRepositoryRepository.list
                            └─ domain/shared/feature-state.ts
                                 deriveFeatureState · availableFeatureActions · console sort
```

The web's `deriveNodeState` calls the same `deriveFeatureState`, so the console, the canvas and
the feature tree agree on what a feature's state is.

### Clean Architecture layers

| Layer | What this feature adds | Depends on |
| ----- | ---------------------- | ---------- |
| Domain | `FeatureState`, `FeatureConsoleAction` (TypeSpec); `deriveFeatureState`, action rules, ordering | generated types only |
| Application | Snapshot, action and log-tail use cases; `ILogFileStore.readTail` port method | domain + output ports |
| Infrastructure | `readTail` in `FileSystemLogFileStore`; `register-feature-console.ts` | application ports |
| Presentation | `shep tui` command; `tui/feature-console/*` on pi-tui; web delegation | use cases + domain types |

The presentation layer makes no business decisions: which rows need the user, which actions a
row offers and the row order all come from the snapshot.

## Implementation Strategy

**MANDATORY TDD**: every phase with executable code follows RED-GREEN-REFACTOR.

1. **Phase 1** adds the enums and extracts state derivation into the domain first, then moves
   the web onto it. The existing web tests (`derive-feature-state.test.ts`) are the regression
   net and must pass unchanged.
2. **Phase 2** builds the three use cases against fakes. The snapshot does all business
   decisions (state, needs-you, available actions, sort, totals) so the presentation only
   formats.
3. **Phase 3** builds the console on pi-tui. The view is a pure `Component` tested against a
   fake terminal; the app wires polling and keys; the CLI command only resolves use cases.
4. **Phase 4** replaces the e2e placeholder with a PTY test, updates the TUI docs, and
   captures screenshots for the PR.

## Files to Create

| File | Purpose |
| ---- | ------- |
| `tsp/common/enums/feature-console.tsp` | `FeatureState`, `FeatureConsoleAction` |
| `domain/shared/feature-state.ts` | The one state derivation, action rules, console ordering |
| `use-cases/feature-console/*` | Snapshot, action, log tail, shared types |
| `di/modules/register-feature-console.ts` | Registration (keeps `register-use-cases.ts` from growing) |
| `tui/feature-console/*` | Terminal wrapper, view, render helpers, formatters, app |
| `cli/commands/tui.command.ts` | `shep tui` |
| `tests/e2e/tui/feature-console.test.ts` | PTY e2e, replaces the placeholder |

## Files to Modify

| File | Changes |
| ---- | ------- |
| `log-file-store.interface.ts` / `.service.ts` | `readTail(path, maxLines)` |
| `derive-feature-state.ts` (web) | Delegate to core via a total `Record` |
| `cli/index.ts` | Register `tui` |
| `translations/*/tui.json` | `console.*` strings, nine locales |
| `docs/tui/*`, `docs/cli/commands.md` | Describe the console |

## Testing Strategy (TDD: Tests FIRST)

**CRITICAL:** Tests are written FIRST in each TDD cycle.

### Unit

- `deriveFeatureState`: every lifecycle and run status, queued vs pending, dead PID
- `availableFeatureActions`: approve/reject only at a gate, stop only while executing, resume
  only after interrupt/failure
- Snapshot: needs-you from gates and from pending questions, sort order, totals, cost and
  elapsed from phase timings, archived hidden by default, repository name fallback
- Action: refuses an action the core does not offer, maps each action to its use case,
  requires feedback for reject, turns thrown errors into a failed result
- Log tail: last N lines of the current run's log, empty when there is no run or no file
- View: renders exactly `rows` lines at any width, selection, mode switches, key handling,
  action keys hidden when not offered
- Fullscreen terminal: enters and leaves the alternate screen, delegates the rest

### E2E

- Create a feature with the mock executor, wait for its PRD gate, open `shep tui` in a PTY,
  assert the row and the needs-you strip, press `a`, assert the feature leaves the gate, press
  `q`, assert the alternate screen is left and the process exits 0.
- `shep tui` without a TTY prints an error and exits 1.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Web behaviour drifts when delegating | Existing web tests unchanged; total Record mapping |
| Flicker or scrollback flooding | Alternate screen; exact-height frames; diff renderer |
| Terminal left in raw/alt mode on crash | `stop()` in `finally` and on SIGINT/SIGTERM |
| Slow refresh overlaps the next one | In-flight guard; skip a tick instead of queueing |
| PTY e2e flakiness | Wait on screen conditions with a deadline, never fixed sleeps |
| Windows PTY differences | node-pty supports ConPTY; test uses the built CLI like other e2e |

---

_Updated by `/shep-kit:new-feature-fast` — see tasks.yaml for detailed task breakdown_
