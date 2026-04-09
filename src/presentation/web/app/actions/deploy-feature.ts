'use server';

import { resolve } from '@/lib/server-container';
import { createDeploymentLogger } from '@shepai/core/infrastructure/services/deployment/deployment-logger';
import type { StartFeatureDeploymentUseCase } from '@shepai/core/application/use-cases/deployments/start-feature-deployment.use-case';
import type { DeploymentState } from '@shepai/core/domain/generated/output';

const log = createDeploymentLogger('[deployFeature]');

export async function deployFeature(
  featureId: string
): Promise<{ success: boolean; error?: string; state?: DeploymentState }> {
  log.info(`called — featureId="${featureId}"`);

  try {
    const useCase = resolve<StartFeatureDeploymentUseCase>('StartFeatureDeploymentUseCase');
    const status = await useCase.execute(featureId);
    log.info(`start succeeded — state=${status.state}`);
    return { success: true, state: status.state };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deploy feature';
    log.error(`error: ${message}`, error);
    return { success: false, error: message };
  }
}
