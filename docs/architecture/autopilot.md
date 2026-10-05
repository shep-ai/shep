# Autopilot and factory status

Spec: [`specs/132-autopilot`](../../specs/132-autopilot/). User guide:
[`docs/guides/autopilot.md`](../guides/autopilot.md).

## Model

`tsp/domain/entities/autopilot.tsp` adds `AutopilotPolicy` (space, `investigateUrgent`,
`fixConfident`, `mergeFixes`, `fillLine`, `projectId`, `dailyFixBudget`) and `AutopilotRun`
(space, investigated and fixed work item keys, built opportunity ids, errors). Migration
`164-create-autopilot` creates `autopilot_policies` and `autopilot_runs` (arrays as JSON).

## Rules (`domain/shared/autopilot.ts`)

`defaultAutopilotPolicy` (all off, budget `DEFAULT_DAILY_FIX_BUDGET`), `isAutopilotOn`,
`isUrgentOpen` (Urgent priority, not Completed or Cancelled), `confidentHypothesis` (a Completed
investigation without a fix whose hypothesis 1 is High), `fixesLeft` (budget minus fixes of passes
in the last 24 hours), `fixGates` (requirements and plan approved, merge per policy) and
`linesToBuild` (accepted opportunities of the line).

## Use cases (`application/use-cases/autopilot/`)

| Use case | Does |
| -------- | ---- |
| `ListUrgentWorkItemsUseCase` | Projects → application repository → `ResolveSpaceContextUseCase.executeMany`; the space's projects' open Urgent work items with their repository |
| `RunAutopilotUseCase` | `runAll(now)` for every policy that is on (the daemon), `run(space)` now. Per space: `InvestigateWorkItemUseCase.start` + `run` (at most `MAX_INVESTIGATIONS_PER_PASS`), `ApproveHypothesisUseCase.execute` with `approvalGates: fixGates(policy)`, `GetOpportunityBoardUseCase` + `BuildOpportunityUseCase`; records the `AutopilotRun` |
| `ManageAutopilotUseCase` | `get(space)` (the default when unset, with recent passes), `set(space, change)` — budget 0 to `MAX_DAILY_FIX_BUDGET`, project by id or slug, filling the line needs a project |
| `GetFactoryStatusUseCase` | The board's line and building count, open incidents and their Proposed runtime actions, pending outcomes and customers to tell, the policy and last pass |

`ApproveHypothesisInput` gains `approvalGates`, passed to `CreateFeatureInput`; without it every
gate still stops for a person.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| Daemon | `createHourlyWatcher` (`infrastructure/services/scheduling/hourly-watcher.ts`, shared with outcomes), started by `startBackgroundSync` |
| CLI | `shep autopilot show|set|run`, `shep factory status` |
| Web | `/factory` |
| DI | `infrastructure/di/modules/register-autopilot.ts` |
