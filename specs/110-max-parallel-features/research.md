## Status

- **Phase:** Research
- **Updated:** 2026-08-10

## Existing Mechanisms This Feature Must Reuse

| Mechanism                            | Where                                                        | Why it matters here                                                     |
| ------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Numeric cap in settings              | `interactiveAgent.maxConcurrentSessions` (tsp → mapper → UI)  | Exact shape to copy for the new field, including the web number input    |
| Deferred-but-initialized state       | `SdlcLifecycle.Pending`                                       | The queue needs no new lifecycle state                                   |
| Gate + reconciler                    | `CheckAndUnblockFeaturesUseCase` / `ReconcileBlockedFeaturesUseCase` | The admission/drain pattern, event side and state side            |
| Single transition owner              | `UpdateFeatureLifecycleUseCase`                               | The one hook that fires on every lifecycle change                        |
| Shared config semantics in domain    | `domain/shared/worktree-config.ts`                            | Precedent for owning `0 = unlimited` + the running set in one place      |
| Branch sync before spawn             | `SyncFeatureBranchUseCase` (feature 107)                      | Must run at admission time, not queue time                               |

## Technology Decisions

See the structured `decisions` list above. In summary:

1. **Representation** — `Pending` + `queuedAt?: utcDateTime`, not a new lifecycle member.
2. **Slot accounting** — `RUNNING_LIFECYCLES` in `domain/shared/parallel-feature-limit.ts`,
   counted with a new indexed `countByLifecycles()` query.
3. **Admission** — `FeatureCapacityService` + an extracted `SpawnFeatureAgentUseCase` shared by
   every spawn path.
4. **Drain** — `AdmitQueuedFeaturesUseCase` on the event side and the state side.
5. **Default** — `0` (unlimited), so upgrades are behaviour-preserving.

## Defect Found During Research (in scope)

`CheckAndUnblockFeaturesUseCase` spawns an auto-unblocked child without `agentType` or `model`,
while `StartFeatureUseCase` passes both from the child's `AgentRun`. A feature created against
`gemini-cli` therefore resumes under the default agent when it is unblocked automatically. The
spawn-path extraction that this feature requires anyway removes the divergence; a regression test
asserting the spawned options carry the recorded `agentType` locks it.

## Interaction Matrix — Two Independent Gates

A feature may start only when **both** gates are open. This table is the specification the
admission tests are written from:

| Parent dependency gate | Capacity slot | Resulting state                                     |
| ---------------------- | ------------- | --------------------------------------------------- |
| Open (or no parent)    | Available     | Started/Requirements/Implementation — agent spawns   |
| Open (or no parent)    | Full          | `Pending` + `queuedAt` set — no agent                |
| Closed                 | Available     | `Blocked` — unchanged, no `queuedAt`                 |
| Closed                 | Full          | `Blocked` — capacity is not evaluated at all         |

The last row matters: a `Blocked` feature must not take a queue slot it cannot use, so capacity is
evaluated **after** the dependency gate, never before. When `CheckAndUnblockFeaturesUseCase`
releases a child and no slot is free, the child moves `Blocked → Pending + queuedAt` rather than
starting.

## Data Model Changes

```
Settings.workflow.maxParallelFeatures : int32 = 0      -- 0 = unlimited
Feature.queuedAt                      : utcDateTime?   -- set when capacity-queued, cleared on admission
```

Two migrations:

- `settings.workflow_max_parallel_features INTEGER NOT NULL DEFAULT 0`
- `features.queued_at TEXT` + index `idx_features_queued_at` for the FIFO scan,
  and an index on `features(lifecycle)` if one does not already exist for the count query.

Both must be added to the mapper **and** to the INSERT column list, the INSERT `@params` list, and
the UPDATE `SET` clause of their repository — the defect documented three times in LESSONS.md.

## New Application Surface

```
domain/shared/parallel-feature-limit.ts
  UNLIMITED_PARALLEL_FEATURES = 0
  RUNNING_LIFECYCLES: Set<SdlcLifecycle>
  isRunningLifecycle(l): boolean
  hasCapacity(running, limit): boolean
  resolveMaxParallelFeatures(settings): number

application/use-cases/features/capacity/
  feature-capacity.service.ts        -- snapshot() + hasCapacity(), reads settings + repo count
  admit-queued-features.use-case.ts  -- drains FIFO while slots remain (both gates re-checked)
  get-parallel-capacity.use-case.ts  -- presentation-facing snapshot: limit, running, queue positions

application/use-cases/features/spawn-feature-agent.use-case.ts
  -- the single spawn path: sync branch, build options from the persisted Feature + AgentRun, spawn
```

`IFeatureRepository` gains `countByLifecycles(lifecycles)` and `listQueued()`.

## Presentation-Agnostic Check

`GetParallelCapacityUseCase` returns `{ limit, running, available, queue: [{ featureId, position }] }`
— no HTTP, terminal or React concepts. The web canvas merges it into node data, `shep feat list`
renders a `Queued (2/5)` column, and the TUI shows the same string. `StartFeatureUseCase` returns
`queued` and `queuePosition` alongside its existing `blocked`/`blockedBy`, so no surface re-derives
the state from the entity — the same rule feature 107 established for `blocked`.

## Security Considerations

No new trust boundary, network surface, or credential handling. Two notes:

- The limit is a **local resource control**, not an authorization boundary; anything that can
  write the settings row can raise it. That is correct for a single-user CLI.
- Input validation still matters: the number input must clamp to a sane range (`0..64`) and
  reject `NaN`, or a bad parse writes a limit that silently queues everything forever. Clamping
  lives in the domain helper, not in the React component.

## Performance Implications

- **Admission cost** is one `SELECT COUNT(*) ... WHERE lifecycle IN (...) AND deleted_at IS NULL`
  per feature start — negligible, and strictly cheaper than the current unbounded spawn.
- **The point of the feature is a performance control**: capping concurrent agents bounds CPU,
  RAM, worktree disk churn and agent-provider rate-limit pressure.
- **The drain sweep** runs on dashboard load next to the existing blocked-features sweep; it is
  one indexed query returning an empty set in the common case.
- **No N+1**: presentation gets the whole queue with positions in a single use-case call rather
  than asking per feature.

## Open Questions

All questions resolved.

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
