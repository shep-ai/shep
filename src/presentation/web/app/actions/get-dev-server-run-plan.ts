'use server';

import { resolve } from '@/lib/server-container';
import type { DeploymentTargetRef } from '@shepai/core/application/services/deployment-target-resolver';
import type {
  GetDevServerRunPlanResult,
  GetDevServerRunPlanUseCase,
} from '@shepai/core/application/use-cases/deployments/get-dev-server-run-plan.use-case';

/**
 * Read the resolved dev-server run plan for a deployment target.
 *
 * Pass-through by design: `isStale` and `repoConfigControlled` are already
 * derived in the use case (FR-13), and every expected condition — no cached
 * plan, an unknown target, a directory that has gone missing — comes back as a
 * typed status rather than an exception. Flattening those here would throw
 * away the vocabulary the disclosure branches on.
 */
export async function getDevServerRunPlan(
  ref: DeploymentTargetRef
): Promise<GetDevServerRunPlanResult> {
  const useCase = resolve<GetDevServerRunPlanUseCase>('GetDevServerRunPlanUseCase');
  return useCase.execute(ref);
}
