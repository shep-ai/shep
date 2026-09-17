## Status

- **Phase:** Planning
- **Updated:** 2026-08-31

## Architecture Overview

```
Before (buggy):
  mount ─┬─▶ effect A (hydrate): setState(loadState())  ──▶ schedules re-render
         └─▶ effect B (persist): saveState(state)        ──▶ runs with STALE
                                                               pre-hydration
                                                               `state` closure
         Both effects run in the SAME initial passive-effect flush, using
         the SAME pre-hydration render closure — effect B's first write is
         deterministically the un-hydrated default, clobbering whatever was
         already saved. It only "self-corrects" on the NEXT render once
         effect A's setState commits — not a guaranteed win against a real
         browser closing, or another tab reading storage, in that window.
         (A useRef guard set inside effect A does not fix this either: both
         effects run in one synchronous pass in source order, so the ref is
         already `true` by the time effect B checks it.)

After (fixed):
  mount ─▶ state = useState(loadState)  [lazy initializer: loadState() runs
            ONCE, synchronously, during the FIRST render — before any
            effect exists to race against it]
         ─▶ effect (persist): saveState(state)  ──▶ `state` is ALREADY the
            hydrated value on this very first run; there is no
            "pre-hydration" render left for it to observe.
```

## Implementation Strategy

**MANDATORY TDD**: Both code-change phases follow RED-GREEN-REFACTOR.

Phase 1 fixes `useWorkspaces` and locks the fix in with a unit test written
first (RED): asserting that no `localStorage.setItem` call during/after
mount may ever contain fewer workspaces than what was already persisted.
That RED test empirically proved the originally-planned `useRef` guard
would not have worked (both effects run in one synchronous pass, so the
ref is already flipped before the persist effect's guard checks it) and
led to switching the fix to a lazy `useState(loadState)` initializer,
which removes the hydrate effect — and the race — entirely. Task 2 extends
coverage to the end-to-end scenario the user actually reported — creating
multiple workspaces, then simulating a browser close/reopen via a hook
remount, and asserting all workspaces and the active selection survive.
Phase 2 is a single non-code task: append the confirmed root cause and fix
to `LESSONS.md`, per this repo's mandatory self-improvement loop, so a
future hydrate/persist effect pairing doesn't reintroduce the same race.

**Clean Architecture scope note:** no domain, application, or
infrastructure layer changes are involved. `useWorkspaces` is a
presentation-layer React hook that is explicitly documented as a
client-only prototype with no backend, domain model, or infrastructure
adapter — this fix stays entirely within that existing boundary.

## Files to Create/Modify

### New Files

| File | Purpose |
| ---- | ------- |
| `tests/unit/presentation/web/hooks/use-workspaces.test.ts` | Unit tests for hydration ordering, `loadState()` referential freshness, and multi-workspace persistence across a simulated remount. |

### Modified Files

| File | Changes |
| ---- | ------- |
| `src/presentation/web/hooks/use-workspaces.ts` | Replace the hydrate-effect + `useState(INITIAL_STATE)` pattern with a lazy `useState(loadState)` initializer (no separate hydrate effect); make every `loadState()` branch return a freshly constructed object instead of the shared `INITIAL_STATE` reference. |
| `LESSONS.md` | Add an entry documenting the hydrate/persist race + referential-identity pattern for future hooks that mix `useEffect`-based localStorage hydration and persistence. |

## Testing Strategy (TDD: Tests FIRST)

**CRITICAL:** Tests are written FIRST in each TDD cycle.

### Unit Tests (RED -> GREEN -> REFACTOR)

- No `localStorage.setItem` call during/after mount ever contains fewer workspaces than what was already persisted (the direct regression test for the reported bug).
- A newly created workspace is persisted to `localStorage` immediately.
- `loadState()`'s fallback branches (empty storage, malformed JSON, non-array `workspaces`) each return a workspaces list matching the default shape.

### Integration Tests

- Renders `useWorkspaces()`, creates two workspaces, unmounts and re-renders the hook (simulating a browser close/reopen), and asserts both workspaces plus the active workspace id are still present.
- Existing Control Center integration tests (`tests/unit/presentation/web/components/features/control-center/control-center-integration.test.tsx` and friends) still pass unmodified, confirming no regression to workspace selector/dialog behavior.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Fix changes effect ordering/timing in a way that breaks another consumer of `useWorkspaces()` | Full existing Control Center test suite (`use-control-center-state`, `control-center`, `control-center-empty-state`, `control-center-integration`) is run unmodified as a regression gate. |
| Lazy `useState(loadState)` initializer reads `localStorage` during a server-rendered pass and crashes | `loadState()` already guards `typeof window === 'undefined'`; the sibling hook `use-viewport-persistence.ts` in the same directory already reads localStorage synchronously the same way with no reported SSR issue. |
| localStorage unavailable (private browsing) | Existing try/catch in `saveState`/`loadState` is preserved as-is; not in scope for this fix. |

---

_Updated by `/shep-kit:new-feature-fast` — see tasks.yaml for detailed task breakdown_
