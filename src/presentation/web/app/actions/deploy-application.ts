'use server';

import { resolve } from '@/lib/server-container';
import type { StartApplicationDeploymentUseCase } from '@shepai/core/application/use-cases/deployments/start-application-deployment.use-case';
import { ApplicationNotFoundError } from '@shepai/core/domain/errors/application-not-found.error';
import { ApplicationRepositoryNotOnDiskError } from '@shepai/core/domain/errors/application-repository-not-on-disk.error';
import { CannotDeploySelfError } from '@shepai/core/domain/errors/cannot-deploy-self.error';
import type { DeploymentState } from '@shepai/core/domain/generated/output';

/**
 * Start a local dev server for an application.
 *
 * Thin server action: parses input, delegates to
 * `StartApplicationDeploymentUseCase`, and maps domain errors to the
 * action's historical response shape.
 *
 * All orchestration (repo lookup, filesystem precondition, self-instance
 * guard, `.start()` call, logging) lives in the use case — see
 * `packages/core/src/application/use-cases/deployments/
 * start-application-deployment.use-case.ts`.
 */
export async function deployApplication(
  applicationId: string
): Promise<{ success: boolean; error?: string; state?: DeploymentState }> {
  if (!applicationId?.trim()) {
    return { success: false, error: 'applicationId is required' };
  }

  try {
    const useCase = resolve<StartApplicationDeploymentUseCase>('StartApplicationDeploymentUseCase');
    const result = await useCase.execute({ applicationId });
    return { success: true, state: result.state };
  } catch (error: unknown) {
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, error: `Application not found: ${applicationId}` };
    }
    if (error instanceof ApplicationRepositoryNotOnDiskError) {
      return {
        success: false,
        error: `Repository path does not exist: ${error.repositoryPath}`,
      };
    }
    if (error instanceof CannotDeploySelfError) {
      return {
        success: false,
        error: 'Cannot start a dev server for the repository Shep is running from',
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to deploy application';
    return { success: false, error: message };
  }
}
