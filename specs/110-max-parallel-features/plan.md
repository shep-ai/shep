## Status

- **Phase:** Planning
- **Updated:** 2026-08-10

## Architecture Overview

```
                     ┌─────────────────────────────────────────┐
                     │ domain/shared/parallel-feature-limit.ts │
                     │  RUNNING_LIFECYCLES · isRunningLifecycle│
                     │  UNLIMITED = 0 · hasCapacity · clamp    │
                     └────────────────────┬────────────────────┘
                                          │ (the rule, defined once)
                                          ▼
    ┌───────────────────────────────────────────────────────────────────┐
    │ application/use-cases/features/capacity/                          │
    │                                                                   │
    │  FeatureCapacityService                                           │
    │    snapshot() → { limit, running, available, queue[] }            │
    │      ├── ISettingsRepository.load()        (the limit)            │
    │      └── IFeatureRepository.countByLifecycles(RUNNING_LIFECYCLES) │
    │                                            (the count, in SQL)    │
    │                                                                   │
    │  AdmitQueuedFeaturesUseCase   GetParallelCapacityUseCase          │
    └──────────┬──────────────────────────────────┬─────────────────────┘
               │ admits (FIFO by queuedAt)        │ read-only snapshot
               ▼                                  ▼
    ┌──────────────────────────────┐   ┌────────────────────────────────┐
    │ SpawnFeatureAgentUseCase     │   │ Web canvas · CLI · TUI         │
    │  sync branch → build options │   │  "Queued — 2 ahead"            │
    │  from Feature + AgentRun     │   └────────────────────────────────┘
    │  → IFeatureAgentProcessService│
    └──────────────┬───────────────┘
                   │ the ONLY spawn path
     ┌─────────────┼──────────────────────────┬───────────────────────┐
     │             │                          │                       │
CreateFeature  StartFeature          CheckAndUnblockFeatures   AdmitQueuedFeatures
 (new work)    (manual start)         (parent gate opened)      (slot freed)

Drain triggers (all funnel into AdmitQueuedFeaturesUseCase):
  UpdateFeatureLifecycleUseCase  — event side, every transition
  UpdateSettingsUseCase          — limit raised or set to 0
  get-graph-data sweep           — state side, self-healing on dashboard load
  DeleteFeatureUseCase           — a running feature vanished, freeing its slot
```

## Implementation Strategy

**MANDATORY TDD**: every phase that produces executable code follows RED → GREEN → REFACTOR.

The phase order is the Clean Architecture dependency rule made into a schedule: domain first
(it depends on nothing), then infrastructure persistence behind its port, then application use
cases that depend only on domain types and port interfaces, and only then presentation, which
reaches core exclusively through use cases. No layer in this plan imports outward.

**Phase 1 (Foundation)** adds the two persisted fields and their migrations. No tests, because
there is no behaviour yet — but `pnpm tsp:codegen` (never `tsp:compile`, per LESSONS.md) runs
here, and both new fields are declared **optional** in TypeSpec so the ~30 existing `Partial<Feature>`
and `Settings` fixtures keep compiling.

**Phase 2 (Domain)** is deliberately its own phase and comes before any consumer exists. The
running-lifecycle set, the `0 = unlimited` rule, and the clamp are the semantics that six
surfaces will read; LESSONS.md ("Shared config semantics belong in domain/") records what happens
when they are written a second time instead of imported. Pure functions, no I/O, trivially
unit-tested first.

**Phase 3 (Persistence)** is two parallel tracks — settings and features — each following the
four-touch chain (tsp → mapper row interface → `toDatabase`/`fromDatabase` → repository
INSERT columns + INSERT `@params` + UPDATE `SET`). The tests are written at the **repository**
level with non-default values, not at the mapper level, because a mapper test proves the object
was shaped right and proves nothing about whether the SQL carries it — the exact defect that has
shipped three times in this codebase.

**Phase 4 (Application)** starts by paying down debt rather than adding to it: three call sites
already build a spawn options bag by hand, and they have already drifted (the auto-unblock path
drops `agentType`/`model`). `SpawnFeatureAgentUseCase` collapses them into one, which is both the
code-quality rule ("three is a pattern that MUST be extracted") and the precondition for
admission control — otherwise the capacity gate would have to be written three times too. Only
then do the capacity service, the two use cases, and the drain wiring go in. DI registration is
its own task because every constructor parameter needs an explicit `@inject(Token)` or it is
silently `undefined` under tsx/vitest/Next.js.

**Phase 5 (Presentation)** is four parallel surfaces sharing one use case. The rule from
LESSONS.md applies: a value the UI displays must come from the use case, never be re-derived —
`StartFeatureUseCase` returns `queued` and `queuePosition` the same way feature 107 made it
return `blocked`/`blockedBy`. Translation keys land in all nine locales in the same commit.

**Phase 6 (Verification)** runs the full local CI sequence and writes the lesson.

## Files to Create/Modify

### New Files

| File | Purpose |
| ---- | ------- |
| `domain/shared/parallel-feature-limit.ts` | The rule: running set, `0 = unlimited`, clamp, capacity predicate |
| `migrations/142-add-max-parallel-features-to-settings.ts` | `settings.workflow_max_parallel_features INTEGER NOT NULL DEFAULT 0` |
| `migrations/143-add-queued-at-to-features.ts` | `features.queued_at TEXT` + FIFO index + lifecycle index |
| `use-cases/features/spawn-feature-agent.use-case.ts` | The single spawn path (sync + options + spawn) |
| `use-cases/features/capacity/feature-capacity.service.ts` | Snapshot of limit / running / available / queue |
| `use-cases/features/capacity/get-parallel-capacity.use-case.ts` | Presentation-facing read model |
| `use-cases/features/capacity/admit-queued-features.use-case.ts` | FIFO drain, both gates re-checked |

### Modified Files

| File | Changes |
| ---- | ------- |
| `tsp/domain/entities/settings.tsp` | `WorkflowConfig.maxParallelFeatures?: int32` |
| `tsp/domain/entities/feature.tsp` | `Feature.queuedAt?: utcDateTime` |
| `settings-defaults.factory.ts` | `maxParallelFeatures: 0` (exact-shape `toEqual` test updated) |
| `settings.mapper.ts` / `feature.mapper.ts` | Row interface + both directions |
| `sqlite-settings.repository.ts` / `sqlite-feature.repository.ts` | INSERT columns, INSERT params, UPDATE SET |
| `sqlite-feature.repository.ts` | New `countByLifecycles()` + `listQueued()` |
| `feature-repository.interface.ts` | Same two methods on the port |
| `create-feature.use-case.ts` | Ask for a slot before spawning; queue instead of spawning |
| `start-feature.use-case.ts` | Same, plus `queued` / `queuePosition` in the result |
| `check-and-unblock-features.use-case.ts` | Delegate to the shared spawner; queue when full |
| `update-feature-lifecycle.use-case.ts` | Drain the queue after the existing unblock call |
| `update-settings.use-case.ts` | Drain when the limit rises or goes to 0 |
| `register-use-cases.ts` | Register the new use cases with explicit tokens |
| `settings-page-client.tsx` | Number input in the Workflow section + fallback object |
| `build-graph-nodes.ts` + `get-graph-data.ts` | Carry queue state onto nodes; forward it from the loader |
| `translations/<9 locales>/{web,cli}.json` | New settings + status keys |
| `LESSONS.md` | The lesson from this feature |

## Testing Strategy (TDD: Tests FIRST)

**CRITICAL:** tests are written FIRST in each cycle.

### Unit Tests (RED → GREEN → REFACTOR)

- **Domain helper** — `0` is unlimited at any running count; the running set contains exactly the
  seven agent-active lifecycles and excludes `Pending`, `Blocked`, `Review`, `AwaitingUpstream`,
  `Maintain`, `Deleting`, `Archived`; the clamp rejects `NaN`, negatives, and absurd values.
- **FeatureCapacityService** — snapshot arithmetic, including `running > limit` after the limit is
  lowered (available must floor at 0, never go negative).
- **AdmitQueuedFeaturesUseCase** — admits in `queuedAt` order; stops exactly at the limit; skips a
  queued feature whose parent gate is closed and leaves it queued; drains everything when the
  limit is `0`; is idempotent when called twice.
- **SpawnFeatureAgentUseCase** — the spawned options carry the `AgentRun`'s `agentType` and
  `modelId` (the regression lock for the divergence found in research).
- **Start/Create admission** — at capacity, no spawn occurs, `queuedAt` is persisted, and the
  result reports `queued` with a position; the dependency gate is still evaluated first.

### Integration Tests (real SQLite)

- Settings round-trip with a **non-default** limit (e.g. `4`), proving the INSERT/UPDATE column
  lists carry it — a default-only assertion would pass with the write path entirely missing.
- Feature round-trip with `queuedAt` set and then cleared back to `NULL`.
- `countByLifecycles()` excludes soft-deleted rows and counts only the running set.
- `listQueued()` returns FIFO order by `queuedAt`.

### End-to-end behaviour (integration, mock executor)

- Limit `2`: start three features → two spawn, the third is `Pending` with `queuedAt`; move one to
  `Maintain` → the third spawns automatically without user action.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Persisted field silently dropped by repository SQL | Repository-level round-trip tests with non-default values; grep a neighbouring column and confirm all three lists (LESSONS.md) |
| A queued feature is never admitted (stranded) | Drain from four independent triggers, including a state-side sweep on dashboard load — never a decrementing counter |
| User-deferred `--pending` feature auto-starts | `queuedAt` is the marker, not the `Pending` lifecycle; the sweep only ever touches rows with a non-null `queuedAt` |
| Dependency-blocked child jumps the capacity gate | Both gates re-checked at admission; capacity is evaluated only after the parent gate opens |
| Spawn-path extraction regresses a working flow | Extract with tests first; the shared spawner is asserted to carry every option each old call site passed, and the two callers keep their existing tests |
| New required tsp field breaks ~30 fixtures | Both fields declared optional — they are per-install toggles, not domain invariants |
| Lowering the limit kills running work | The cap governs admission only; nothing in the drain path can stop a process. A unit test asserts a lowered limit produces no termination call |

---

_Updated by `/shep-kit:plan` — see tasks.yaml for detailed task breakdown_
