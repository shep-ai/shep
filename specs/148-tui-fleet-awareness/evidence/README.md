# Evidence: fleet awareness in `shep tui` (spec 148)

Three frames from the **real console view**, drawn from a **real snapshot** taken against a
throwaway `SHEP_HOME`:

1. A git repo named `repo`, one feature created with the deterministic mock executor
   (`shep feat new "Rate limit the public API"`), parked at its merge gate.
2. `SetFleetQueuePauseUseCase` parks the admission queue, back-dated 2 h 05 m so the banner's
   age formatting is visible rather than `0s`.
3. Frames 01–03 are `FeatureConsoleView.render(140)` — the same view, strings and geometry the
   console uses — with the use cases resolved from the container. Keys are delivered through
   `handleInput`, the same entry point pi-tui calls.

**What is not a real run here.** The PTY transport. `node-pty` cannot spawn on this machine
(`posix_spawnp failed`) — the pre-existing `tests/e2e/tui/feature-console.test.ts` cases fail
identically at `PtyScreen.spawn`, so `tests/e2e/tui` could not be run to produce xterm PNGs. The
e2e case for this feature exists (`shows a parked admission queue, releases it with u then y, and
clears the banner`) and is what CI runs; it was not exercised locally. Frames therefore come from
`view.render()` rather than a headless-xterm replay, and there are no `.png` files.

| Frame | What it shows |
| --- | --- |
| `screens/01-queue-paused.txt` | Banner under the counts: `⏸ queue paused 2h 05m — Consecutive failure threshold reached (4/4 …)`; key bar gains `u release queue` |
| `screens/02-release-confirm.txt` | `u` does not release: the status line asks `Release the paused queue? New features can start. (y/n)` |
| `screens/03-queue-released.txt` | After `y`: banner gone (the re-read is the source of truth), `✓ Queue released — queued features can start`, and `u release queue` no longer offered |

Trailing spaces are trimmed; everything else is the rendered screen at 140×36.

Reproduce:

```bash
mkdir -p .tmp-cli/home .tmp-cli/repo
git -C .tmp-cli/repo init -b main
SHEP_HOME="$PWD/.tmp-cli/home" SHEP_MOCK_EXECUTOR=1 \
  ./node_modules/.bin/tsx src/presentation/cli/index.ts feat new "Rate limit the public API" \
  --repo "$PWD/.tmp-cli/repo"
```

Then a throwaway script (~50 lines, not committed) that:

1. calls `initializeContainer()` and `initI18n('en')`;
2. resolves `GetFeatureConsoleSnapshotUseCase` and `SetFleetQueuePauseUseCase` from the container;
3. parks the queue with `{ paused: true, reason, now: new Date(Date.now() - 125 * 60_000) }`;
4. builds `new FeatureConsoleView({ t, rows: () => 36, intents: noop })`, calls `setSnapshot`, and
   prints `view.render(140)` with ANSI codes stripped after each step (`u`, then `y` + release +
   a fresh snapshot).

The frames are the view's own output, so they are exactly what the console draws in the same
geometry — only the PTY transport and the pi-tui screen diffing are absent.
