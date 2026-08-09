/**
 * Storybook stand-in for the run-plan invalidate ("Re-analyze") action.
 * Always succeeds — the plan is cleared until the next start re-runs the
 * tier chain, which is what the summary's empty state then shows.
 */

export async function invalidateDevServerRunPlan(ref: {
  targetType: string;
  targetId: string;
}): Promise<unknown> {
  return {
    status: 'ok',
    repoPath: '/repos/acme',
    clearedSource: 'Deterministic',
    repoConfigControlled: ref.targetId === 'story-repo-config',
  };
}
