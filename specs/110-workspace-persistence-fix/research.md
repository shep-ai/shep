## Status

- **Phase:** Research
- **Updated:** 2026-08-31

## Technology Decisions

### Keep workspaces client-only (localStorage) rather than promoting to backend persistence

**Options considered:**

1. Promote `Workspace` to a full Clean Architecture entity (tsp model,
   domain, use cases, SQLite repository/migration).
2. Move persistence to `sessionStorage`.
3. Fix the existing `localStorage`-based hook in place.

**Decision:** Fix the existing `localStorage`-based hook in place.

**Rationale:** The hook is an explicitly documented prototype boundary with
zero backend touchpoints today (confirmed via grep across
`packages/core/src/domain`, `application/use-cases`,
`infrastructure/persistence/sqlite/migrations`, and `tsp/` — none reference
"workspace"). The bug reported by the user is data loss on browser
close/reopen, which is a race condition in the hook's effects, not a missing
persistence layer. Promoting to backend storage is a separate, larger
feature that should be scoped and planned on its own if/when workspaces
leave prototype status.

### Race-condition fix strategy in useWorkspaces

**Options considered:**

1. `useRef`-based hydration guard gating a separate hydrate-then-persist effect pair.
2. Merge hydrate and persist into a single combined `useEffect`.
3. Rewrite the hook around `useSyncExternalStore`.
4. Debounce/delay the persist effect.
5. Lazy `useState(loadState)` initializer, dropping the hydrate effect entirely.

**Decision:** Lazy `useState(loadState)` initializer, dropping the hydrate effect entirely.

**Rationale:** A RED test asserting that no `localStorage.setItem` call
during/after mount may ever contain fewer workspaces than what was already
persisted proved that the two-effect pattern (hydrate effect + persist
effect) always fires the persist effect's first invocation with the
un-hydrated default, because both effects run in the same initial
passive-effect flush using the same pre-hydration render closure — it only
"self-corrects" on the next render, which is not a guaranteed win against a
real browser closing or another tab reading storage in that window. The
originally-planned `useRef` hydration guard (set *inside* the hydrate
effect) does not actually prevent this either: both effects run in one
synchronous pass in source order, so the ref is already `true` by the time
the persist effect checks it — the guard never gets to skip that first
stale write. Switching to a lazy `useState` initializer removes the race by
construction: `loadState()` runs once, synchronously, during the first
render, before any effect can run, so there is no "pre-hydration" render
for the persist effect to ever observe. This also mirrors the existing
sibling hook in the same directory, `use-viewport-persistence.ts`, which
already reads its localStorage default synchronously
(`useRef(readViewport()).current`) rather than through a mount effect.
Every `loadState()` branch is also changed to construct a fresh object via
a `freshInitialState()` helper instead of returning the shared
`INITIAL_STATE` reference — retained as a correctness improvement even
though it is no longer load-bearing for the primary race once the lazy
initializer removes the hydrate effect.

## Library Analysis

No new libraries. The fix uses `useRef`, already imported from `react`
elsewhere in this codebase, and the existing `window.localStorage` API
already used by this hook.

## Security Considerations

No security implications identified. `localStorage` access is unchanged;
no new data is written or read beyond what the hook already handles.

## Performance Implications

No performance implications identified. The fix adds one `useRef` check
(O(1)) and avoids a redundant/incorrect `localStorage.setItem` write on
mount — if anything, a marginal improvement.

## Open Questions

All questions resolved.

---

_Updated by `/shep-kit:new-feature-fast` — proceed with `/shep-kit:implement`_
