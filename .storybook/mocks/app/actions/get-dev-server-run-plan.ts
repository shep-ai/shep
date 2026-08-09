/**
 * Storybook stand-in for the run-plan read action.
 *
 * Storybook aliases `@/app/actions` module-wide, so a single mock has to serve
 * every story. It branches on the target id instead — each run-plan story
 * passes a sentinel id naming the backend condition it wants to show.
 */

export const RUN_PLAN_STORY_TARGET = {
  Default: 'story-default',
  NoPlan: 'story-no-plan',
  Stale: 'story-stale',
  RepoConfigControlled: 'story-repo-config',
  LoadError: 'story-load-error',
} as const;

const BASE_PLAN = {
  repoPath: '/repos/acme',
  command: 'pnpm dev',
  cwd: '/repos/acme',
  source: 'Deterministic',
  packageManager: 'pnpm',
  setupCommands: [],
  isStale: false,
};

export async function getDevServerRunPlan(ref: {
  targetType: string;
  targetId: string;
}): Promise<unknown> {
  switch (ref.targetId) {
    case RUN_PLAN_STORY_TARGET.NoPlan:
      return { status: 'no-plan', repoPath: '/repos/acme', repoConfigControlled: false };
    case RUN_PLAN_STORY_TARGET.Stale:
      return {
        status: 'ok',
        repoPath: '/repos/acme',
        repoConfigControlled: false,
        plan: { ...BASE_PLAN, source: 'Manual', command: 'make dev-with-fixtures', isStale: true },
      };
    case RUN_PLAN_STORY_TARGET.RepoConfigControlled:
      return {
        status: 'ok',
        repoPath: '/repos/acme',
        repoConfigControlled: true,
        plan: { ...BASE_PLAN, source: 'Manual', command: 'docker compose up' },
      };
    case RUN_PLAN_STORY_TARGET.LoadError:
      return { status: 'target-not-found', message: 'No such application: story-load-error' };
    default:
      return {
        status: 'ok',
        repoPath: '/repos/acme',
        repoConfigControlled: false,
        plan: BASE_PLAN,
      };
  }
}
