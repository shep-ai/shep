'use server';

import { resolve } from '@/lib/server-container';
import type { DeploymentTargetRef } from '@shepai/core/application/services/deployment-target-resolver';
import type {
  InvalidateDevServerRunPlanResult,
  InvalidateDevServerRunPlanUseCase,
} from '@shepai/core/application/use-cases/deployments/invalidate-dev-server-run-plan.use-case';

/**
 * The "Re-analyze" action — clear the cached plan so the next start re-runs
 * the full tier chain.
 *
 * The result reports which source was discarded, and whether a committed
 * `.shep/dev.json` still controls the repository. That last flag matters: it
 * is the difference between "cleared, the next start will re-detect" and
 * "cleared, but the same command will still run because a file says so".
 */
export async function invalidateDevServerRunPlan(
  ref: DeploymentTargetRef
): Promise<InvalidateDevServerRunPlanResult> {
  const useCase = resolve<InvalidateDevServerRunPlanUseCase>('InvalidateDevServerRunPlanUseCase');
  return useCase.execute(ref);
}
