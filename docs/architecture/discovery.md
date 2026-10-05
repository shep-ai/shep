# Discovery

Spec: [`specs/128-discovery`](../../specs/128-discovery/). User guide:
[`docs/guides/discovery.md`](../guides/discovery.md).

## Model

`tsp/domain/entities/discovery.tsp` adds `DiscoveryRun` (space, status `Running` /
`Succeeded` / `Failed`, agent type, signals read, proposed, dropped, finished at, error).
`Opportunity` gains `source` (`OpportunitySource`: `Manual`, `Theme`, `Discovery`) and `brief`;
`OpportunityWeights` gains `discoveryEveryHours`. Migration `161-create-discovery`.

## Run

`RunDiscoveryUseCase` (`application/use-cases/discovery/`):

1. resolves the space and its agent rules (`isAgentAllowedInSpace`; the first allowed agent when
   none is named) and environment (`spaceEnvironment`);
2. refuses while a run younger than `DISCOVERY_STALE_MS` is Running, and marks an older one
   Failed;
3. gathers up to `MAX_DISCOVERY_SIGNALS` unlinked signals, their themes, open opportunity titles
   and up to `MAX_DISCOVERY_DOCUMENTS` knowledge document titles;
4. records a Running run and calls `IStructuredAgentCaller` with `discoveryPrompt` and
   `DISCOVERY_SCHEMA` — no tools, MCP off, `DISCOVERY_TIMEOUT_MS`;
5. checks the answer with `checkProposals` (`domain/shared/discovery-proposals.ts`): cited ids
   must be loose signals of the space, titles new, numbers clamped, at most
   `MAX_DISCOVERY_PROPOSALS`;
6. creates the kept proposals through `ManageOpportunitiesUseCase` (source `Discovery`), links
   their signals through `ManageSignalsUseCase`, and finishes the run.

A failed agent call finishes the run as Failed with the error.

## Schedule

`ManageOpportunityWeightsUseCase.setDiscovery` sets or clears a space's interval
(`MIN_DISCOVERY_EVERY_HOURS`–`MAX_DISCOVERY_EVERY_HOURS`). `SyncDiscoveryUseCase.runDue`
checks each scheduled space with `isIntervalDue` against its latest run and runs the due ones in
turn; `startBackgroundSync` ticks it every minute through the due-work watcher.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| CLI | `shep discovery run / ls / schedule` |
| Web | Discovery panel and Discovered badge on `/opportunities` |
| DI | `infrastructure/di/modules/register-discovery.ts` |
