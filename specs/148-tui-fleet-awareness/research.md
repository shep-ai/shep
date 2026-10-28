## Status

- **Phase:** Research
- **Updated:** 2026-10-24

## What already exists

Spec 111 shipped two of the three readers the pause needs, and both are correct:

- `GetFleetOverviewUseCase` resolves the stored pause, applies the breaker acknowledgement
  window, evaluates consecutive failures and the rolling rate, and performs the configured
  auto-pause write when it trips. It is the only place that decides "paused" and "tripped".
- `SetFleetQueuePauseUseCase` is the only writer, shared by the breaker, `shep fleet pause` /
  `resume`, and the web Resume button. The breaker deliberately cannot resume; only a user can.

The console (spec 142) already has the machinery this feature needs: a snapshot that arrives
decided, a status line, confirmation modes (`ConfirmStop`), a dynamic-rows contract and a PTY
e2e harness (`tests/helpers/tui/pty-screen.ts`).

## Decisions

The `decisions` array above is the source of truth. In short:

1. Read the verdict through `GetFleetOverviewUseCase`, injected into the snapshot use case.
2. Decide in core, into a `FeatureConsoleFleet` field; the view formats only.
3. Release with `u`, gated on a pause and confirmed with `y`, wired to `SetFleetQueuePauseUseCase`.
4. One banner line, whose height is taken out of the body rather than the key bar.
5. No TypeSpec change: the snapshot is a view model, and the domain facts are already TypeSpec.
6. `releaseQueue` is a separate intent, not a fifth `FeatureConsoleAction` — that enum is
   per-feature and shared with the web.

## Rejected alternatives

Visibility without a key is the current state and the thing this spec removes: it still sends
the user to another shell. A modal help overlay for the reason would occlude the roster, which
is how #881 happened with the status bar. Reading `settings.workflow.queuePaused` directly
would skip the acknowledgement window and the auto-pause write, so the console and
`fleet status` would disagree.
