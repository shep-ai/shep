'use server';

import { resolve } from '@/lib/server-container';
import type { ListDeploymentsUseCase } from '@shepai/core/application/use-cases/deployments/list-deployments.use-case';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';

export async function listDeployments(): Promise<DeploymentStatusEntry[]> {
  const useCase = resolve<ListDeploymentsUseCase>('ListDeploymentsUseCase');
  return useCase.execute();
}
