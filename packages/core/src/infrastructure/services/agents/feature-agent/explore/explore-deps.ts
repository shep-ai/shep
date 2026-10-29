/**
 * Builds Explore mode's dependencies for one feature run (spec 150): when to
 * explore, and how — a refinement whose rollouts use the RAW executor.
 */

import type { DependencyContainer } from 'tsyringe';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IHarnessInstaller } from '@/application/ports/output/services/harness-installer.interface.js';
import { RefineHarnessUseCase } from '@/application/use-cases/harness-learning/refine-harness.use-case.js';
import { ResolveExplorePlanUseCase } from '@/application/use-cases/harness-learning/resolve-explore-plan.use-case.js';
import { FastImplementRolloutRunner } from './fast-implement-rollout-runner.js';
import type { ExploreNodeDeps } from './with-explore.js';

export function createExploreDeps(
  container: DependencyContainer,
  rawExecutor: IAgentExecutor,
  agentRunId: string,
  log: (message: string) => void
): ExploreNodeDeps {
  return {
    plan: (featureId) => container.resolve(ResolveExplorePlanUseCase).execute(featureId),
    run: (state, plan) =>
      container.resolve(RefineHarnessUseCase).execute({
        featureId: state.featureId,
        featureName: plan.featureName,
        repositoryPath: state.repositoryPath,
        featureWorktree: state.worktreePath || state.repositoryPath,
        agentType: rawExecutor.agentType,
        agentRunId,
        k: plan.k,
        recursion: plan.recursion,
        maxCostUsd: plan.maxCostUsd,
        alwaysOnCharCap: plan.alwaysOnCharCap,
        runner: new FastImplementRolloutRunner(
          rawExecutor,
          container.resolve<IHarnessInstaller>('IHarnessInstaller'),
          state
        ),
      }),
    log,
  };
}
