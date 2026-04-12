/**
 * List Deployments Use Case
 *
 * Returns all currently tracked dev server deployments with live processes.
 * Used by presentation layers to hydrate shared deployment state on page
 * load and to synchronize status across components viewing the same target.
 */

import { injectable, inject } from 'tsyringe';
import type {
  IDeploymentService,
  DeploymentStatusEntry,
} from '../../ports/output/services/deployment-service.interface.js';

@injectable()
export class ListDeploymentsUseCase {
  constructor(
    @inject('IDeploymentService') private readonly deploymentService: IDeploymentService
  ) {}

  async execute(): Promise<DeploymentStatusEntry[]> {
    return this.deploymentService.listAll();
  }
}
