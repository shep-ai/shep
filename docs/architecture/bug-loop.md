# Bug loop

Spec 123. An agent investigates a work item in a throwaway checkout and returns ranked
root-cause hypotheses. An approved hypothesis becomes a test-first fix feature. User guide:
[`docs/guides/bug-loop.md`](../guides/bug-loop.md).

## Model

`tsp/domain/entities/investigation.tsp`:

- `WorkItemInvestigation`: work item, repository path, commit, `InvestigationStatus`
  (Pending → Running → Completed | Failed), summary, `Hypothesis[]`, agent type, timestamps,
  error, and after approval `approvedHypothesisNumber` and `featureId`.
- `Hypothesis`: number (rank), title, root cause, `HypothesisConfidence`, `HypothesisEvidence[]`
  (repository-relative file, line, note), test plan, fix plan.

Table `work_item_investigations` (migration 155); hypotheses are a JSON column.

Pure rules in `domain/shared/investigation.ts`: `rankHypotheses` (validate, order by
confidence, cap at five, number from 1, strip the checkout path from evidence and use forward
slashes), the 20-minute agent budget, and when an open investigation counts as abandoned
(not updated for 25 minutes).

## Running an investigation

`InvestigateWorkItemUseCase`:

1. `start(input)` resolves the work item (id or key), refuses if one is active, picks the
   repository (explicit, then the item's previous one, then the project's application),
   resolves the agent (explicit or `settings.agent.type`), checks the space allows it, and
   records a Pending investigation.
2. `run(id)` marks it Running, resolves the space environment, prepares the checkout, makes
   one `IStructuredAgentCaller.call` with `INVESTIGATION_RESULT_SCHEMA`, and finishes as
   Completed, or Failed with the error (including "no hypothesis"). The checkout is disposed in
   `finally`.

The CLI awaits `run`; the web server action returns after `start` and lets `run` continue while
the panel polls `GetWorkItemInvestigationsUseCase`. Investigations do not create `AgentRun` rows:
those are owned by worker processes and reaped by pid, and this runs inside the server.

Call options: `cwd` = checkout, `tools: ['Read', 'Grep', 'Glob']`, `disableMcp`, `silent`,
`maxTurns: 60`, `timeout: 20 min`, `agentType`, `environment`.

### Checkout

`IInvestigationWorkspace` (`application/ports/output/services/investigation-workspace.interface.ts`),
implemented by `GitInvestigationWorkspace` (`infrastructure/services/git/`):
`git worktree add --detach -- <shep home>/inv/<id[0..8]> <HEAD sha>`, and `git worktree remove
--force` (falling back to deleting the directory and `git worktree prune`). Worktree hooks are
not run. Before each prepare, directories older than the abandonment threshold are swept.

### Space environment per call

Feature workers are separate processes and set their own environment (spec 121). An
investigation runs inside the long-lived server, so `AgentExecutionOptions.environment` carries
the space's `SpaceEnvironment` and every subprocess executor passes it to `buildSpawnOptions`.
Executors that call an HTTP API directly ignore it.

## Approving

`ApproveHypothesisUseCase.execute({ workItem, hypothesis, investigationId?, fullSpec?,
agentType? })`:

- Uses the named investigation or the latest Completed one, and refuses a second approval.
- Builds `CreateFeatureInput` with `buildFixPrompt` (`application/use-cases/bug-loop/fix-prompt.ts`):
  the report, the root cause and commit, the evidence, then "write the failing test first;
  if it passes, stop and report", the fix and a test run. Name: `Fix <KEY>: <title>`. Build mode:
  Fast, or Application with `fullSpec`.
- `createRecord`, record `featureId` and the hypothesis number, move the work item to its
  project's Started state (`ProjectStates`, shared with tracker sync), then
  `initializeAndSpawn` as `started`. `started` resolves to `{ warning? , error? }` and never
  rejects. The CLI awaits it; the web does not.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| CLI | `shep item investigate`, `shep item hypotheses`, `shep item fix` |
| Web | Investigation panel on the work item page (`components/features/bug-loop/`), actions in `app/actions/bug-loop.ts` |
| DI | `infrastructure/di/modules/register-bug-loop.ts` |
