## Inspected seams
- CheckAndUnblockFeaturesUseCase blocks children until parent Maintain,
  rebases child and spawns through SpawnFeatureAgentUseCase.
- ReparentFeatureUseCase performs cycle and repository validation, lifecycle
  transition and worker stop.
- SyncFeatureBranchUseCase delegates merge-conflict editing to the agent,
  but editing an already conflicted file is not alone agent-owned S2 scheduling.
- FeatureCapacityService claims slots atomically; resource cap ownership is
  distinct from the inter-feature dependency choice.
- IAgentExecutorProvider resolves the configured executor per call.

## Limitations
Path overlap is a potential disturbance, not proof of semantic conflict.
Uncommitted work is outside the current evidence. Worktree/lifecycle changes
between the last revalidation and non-atomic reparenting remain a race-risk
until guarded integration tests establish safe application.
