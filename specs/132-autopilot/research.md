## Findings

- `InvestigateWorkItemUseCase.start` then `run`; `ApproveHypothesisUseCase.execute` starts the
  fix feature (fast by default) and moves the work item to Started.
- `GetOpportunityBoardUseCase` returns the line; `BuildOpportunityUseCase` builds into a project.
- Project → application → repository path → `ResolveSpaceContextUseCase` gives the space.
