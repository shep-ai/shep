/**
 * Stop Deployment Use Case
 *
 * Stops a running dev server deployment for the given targetId.
 * Delegates graceful shutdown (SIGTERM → SIGKILL) to the deployment service.
 */

import { injectable, inject } from 'tsyringe';
import type { IDeploymentService } from '../../ports/output/services/deployment-service.interface.js';

@injectable()
export class StopDeploymentUseCase {
  constructor(
    @inject('IDeploymentService') private readonly deploymentService: IDeploymentService
  ) {}

  async execute(targetId: string): Promise<void> {
    if (!targetId?.trim()) {
      throw new Error('targetId is required');
    }
    await this.deploymentService.stop(targetId);
  }
}
