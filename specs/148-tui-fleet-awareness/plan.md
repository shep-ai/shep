## Approach

The change follows the existing seams rather than adding new ones. Clean Architecture holds:
the snapshot use case (application) owns the decision, `console-render.ts` (presentation)
formats it, and the CLI command resolves the use case, exactly as it already does for the
console's other three use cases.

TDD runs per task, RED -> GREEN -> REFACTOR:

- **RED** first in every phase — the tests below are written and watched fail before the
  implementation exists. Phase 1's RED is a snapshot assertion on a paused fleet; phase 2's is
  a rendered banner; phase 3's is a key press that must ask first and then call the intent;
  phase 4's is the PTY run.
- **GREEN** is the smallest implementation that satisfies the red test, in the layer the
  decision belongs to.
- **REFACTOR** removes what the change made redundant: the view's constant chrome height
  becomes a function, the banner composes existing format helpers (`formatDuration`,
  `sanitizeText`, `fit`) instead of new ones, and the command's error mapping is shared with
  the action path rather than copied.

### Phase 1 — Core

`FeatureConsoleFleet` is added to the snapshot types:

```ts
export interface FeatureConsoleQueuePause {
  pausedAt: Date;
  reason: string;
}

export interface FeatureConsoleFleet {
  queuePause?: FeatureConsoleQueuePause;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
}
```

`pausedAt` is normalised to `Date` in the use case because the generated `FleetQueuePause`
types it as `utcDateTime`, emitted as `any`; the render needs arithmetic. The snapshot use
case injects `GetFleetOverviewUseCase` and calls `execute(input.repositoryPath)`, so a
`--repo` console shows a scoped verdict exactly as `shep fleet status --repo` does (and the
scoped read does not park the global queue — that guard already exists in the overview use
case).

### Phase 2 — Rendering

`renderBanner(fleet, now, t)` returns one line or nothing:

- paused: `⏸ queue paused 2h 05m — <reason>`, painted as attention
- tripped without a pause: `⚡ breaker tripped — <reason>`, painted as error

`renderKeyBar` gains an optional `releaseQueue` flag and appends `u release queue`;
`renderHelp` gains its line. Chrome height in the view becomes
`CHROME_LINES + (banner ? 1 : 0)`, used by both `render` and `rosterCapacity` so paging stays
correct.

### Phase 3 — The lever

`ConsoleKey.ReleaseQueue` ('u') opens `Mode.ConfirmReleaseQueue`, which renders
`Release the paused queue? New features can start. (y/n)` in the status line, mirroring
`ConfirmStop`. `y` calls the view's `releaseQueue` intent; anything else returns to browse.
The intent reaches `FeatureConsoleAppDeps.releaseQueue`, which `tui.command.ts` wires to
`SetFleetQueuePauseUseCase.execute({ paused: false })`. The app shows the result in the status
line and re-polls; it never clears the banner itself, so a refused release leaves the pause
visible.

### Phase 4 — Proof and docs

The e2e test parks the queue with `SetFleetQueuePauseUseCase`, starts the console in a PTY,
asserts the banner, presses `u`, asserts the confirm prompt, presses `y`, and waits for the
banner to disappear after the re-read. Evidence is the PTY bytes replayed through xterm.js,
following `specs/142-tui-feature-console/evidence/README.md`.

## Risks

- **A 2s write.** With auto-pause on, a console poll can park the queue on a trip. That is the
  same behaviour the web dashboard has had since #937, and it is the reason the console shows
  the pause: the write must have a visible consequence. The release path is idempotent.
- **One more read per poll.** `getOverview` + breaker metrics on an interval. It is the same
  work `shep fleet status` does on demand; measured against the existing 5 reads per poll, it
  is acceptable, and the console already serialises refreshes.
- **Nine locales.** Translation keys are mechanical but `translation-completeness` fails on a
  missing key, so the PR touches every `tui.json`.
