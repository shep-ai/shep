/**
 * Get Deployment Status Use Case
 *
 * Returns the current deployment status snapshot for a single target,
 * or null when no deployment exists.
 */

import { injectable, inject } from 'tsyringe';
import type {
  IDeploymentService,
  DeploymentStatus,
} from '../../ports/output/services/deployment-service.interface.js';

@injectable()
export class GetDeploymentStatusUseCase {
  constructor(
    @inject('IDeploymentService') private readonly deploymentService: IDeploymentService
  ) {}

  async execute(targetId: string): Promise<DeploymentStatus | null> {
    if (!targetId?.trim()) {
      return null;
    }
    return this.deploymentService.getStatus(targetId);
  }
}
