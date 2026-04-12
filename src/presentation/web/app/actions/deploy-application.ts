'use server';

import { existsSync } from 'node:fs';
import { resolve } from '@/lib/server-container';
import { createDeploymentLogger } from '@shepai/core/infrastructure/services/deployment/deployment-logger';
import type { IApplicationRepository } from '@shepai/core/application/ports/output/repositories/application-repository.interface';
import type { IDeploymentService } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import type { IShepInstanceService } from '@shepai/core/application/ports/output/services/shep-instance-service.interface';
import { DeploymentState } from '@shepai/core/domain/generated/output';

const log = createDeploymentLogger('[deployApplication]');

/**
 * Start a local dev server for an application.
 *
 * Mirrors `deployFeature` / `deployRepository`, but keyed by the
 * application's stable ID (UUID) so multiple applications at similar
 * paths can't collide in the `dev_servers` table.
 *
 * The `DeploymentService` writes to the `dev_servers` SQLite table on
 * spawn, updates it on Ready (with the detected URL), and removes the
 * row on stop — so deployment state is fully persisted across page
 * reloads AND service restarts (recoverAll() reconciles live PIDs on
 * startup).
 */
export async function deployApplication(
  applicationId: string
): Promise<{ success: boolean; error?: string; state?: DeploymentState }> {
  log.info(`called — applicationId="${applicationId}"`);

  if (!applicationId?.trim()) {
    log.warn('rejected — applicationId is empty');
    return { success: false, error: 'applicationId is required' };
  }

  try {
    const appRepo = resolve<IApplicationRepository>('IApplicationRepository');
    const application = await appRepo.findById(applicationId);

    if (!application) {
      log.warn(`application not found: "${applicationId}"`);
      return { success: false, error: `Application not found: ${applicationId}` };
    }

    const repositoryPath = application.repositoryPath;
    log.info(`application found — repositoryPath="${repositoryPath}"`);

    if (!existsSync(repositoryPath)) {
      log.warn(`repository path does not exist on disk: "${repositoryPath}"`);
      return { success: false, error: `Repository path does not exist: ${repositoryPath}` };
    }

    const shepInstance = resolve<IShepInstanceService>('IShepInstanceService');
    if (shepInstance.isSameInstance(repositoryPath)) {
      log.warn('rejected — target is the running shep instance');
      return {
        success: false,
        error: 'Cannot start a dev server for the repository Shep is running from',
      };
    }

    log.info('repository exists, calling deploymentService.start()');
    const deploymentService = resolve<IDeploymentService>('IDeploymentService');
    // Key by application.id (not repositoryPath) so each application is
    // its own first-class row in `dev_servers` — keeps recovery and the
    // dev-server lifecycle isolated per application even if two apps
    // happened to share a filesystem root.
    deploymentService.start(applicationId, repositoryPath, 'application');

    log.info('start() returned successfully — state=Booting');
    return { success: true, state: DeploymentState.Booting };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deploy application';
    log.error(`error: ${message}`, error);
    return { success: false, error: message };
  }
}
