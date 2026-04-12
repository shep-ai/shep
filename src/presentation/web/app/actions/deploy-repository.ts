'use server';

import { resolve } from '@/lib/server-container';
import { createDeploymentLogger } from '@shepai/core/infrastructure/services/deployment/deployment-logger';
import type { StartRepositoryDeploymentUseCase } from '@shepai/core/application/use-cases/deployments/start-repository-deployment.use-case';
import type { DeploymentState } from '@shepai/core/domain/generated/output';

const log = createDeploymentLogger('[deployRepository]');

export async function deployRepository(
  repositoryPath: string
): Promise<{ success: boolean; error?: string; state?: DeploymentState }> {
  log.info(`called — repositoryPath="${repositoryPath}"`);

  try {
    const useCase = resolve<StartRepositoryDeploymentUseCase>('StartRepositoryDeploymentUseCase');
    const status = await useCase.execute(repositoryPath);
    log.info(`start succeeded — state=${status.state}`);
    return { success: true, state: status.state };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deploy repository';
    log.error(`error: ${message}`, error);
    return { success: false, error: message };
  }
}
