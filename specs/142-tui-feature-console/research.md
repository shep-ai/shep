## Status

- **Phase:** Research
- **Updated:** 2026-10-24

## Technology Decisions

### 1. Terminal UI library

**Options considered:**

1. `@oh-my-pi/pi-tui`: Bun-only (`bun:ffi`, `Bun.stringWidth` x34), exports `./src/index.ts`,
   needs the Rust `pi-natives` addon, entangled with omp's agent packages.
2. Ink 8: React for CLIs with flexbox, but requires React >= 19.3.
3. `@mariozechner/pi-tui` 0.73.1: Node >= 20, compiled `dist/`, MIT.

**Decision:** `@mariozechner/pi-tui`.

**Rationale:** Runs on Node today (spike verified), small, and the Agent Hub design it carries
ports directly. Its `Terminal` interface also makes a fake terminal trivial in unit tests.

### 2. Full-screen rendering

A `FullscreenTerminal` decorator enters the alternate screen on `start()` and leaves it on
`stop()`. The console view renders exactly `rows` lines, so the inline diff renderer behaves
as a full-screen one and the user's scrollback is untouched.

### 3. One feature-state derivation

`deriveFeatureState(feature, run, { isPidAlive })` moves the web's rules into
`domain/shared/feature-state.ts` and adds `queued` (a Pending feature waiting on a capacity
slot). `FeatureState` values match the web's strings; the web maps through a total `Record`.

### 4. Live updates

A 2-second poll of `GetFeatureConsoleSnapshotUseCase`. Elapsed time ticks between polls from
the snapshot's timestamps.

### 5. E2E harness

`node-pty` + `@xterm/headless`, against the built CLI with `SHEP_MOCK_EXECUTOR=1` and an
isolated `SHEP_HOME`.

## Library Analysis

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| @mariozechner/pi-tui | 0.73.1 | Renderer, keys, Input | Node-native, MIT, diff rendering, Kitty keys | Inline-first; full screen needs a wrapper |
| @xterm/headless | 6.0.0 | E2E screen buffer | Same engine as the web terminal | Dev-only dependency |

## Security Considerations

The console runs locally against the user's own database and calls existing use cases with
their existing authorization. Reject feedback is passed as data, never through a shell. Log
tails are read from shep's own log directory by run id, not from a user-supplied path.

## Performance Implications

Each refresh is five batched reads (no per-feature queries). The renderer repaints only
changed lines, and a refresh never overlaps the previous one.

## Open Questions

All questions resolved.

---

_Updated by `/shep-kit:new-feature-fast`_
