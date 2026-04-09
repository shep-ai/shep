'use server';

import { resolve } from '@/lib/server-container';
import type { GetDeploymentStatusUseCase } from '@shepai/core/application/use-cases/deployments/get-deployment-status.use-case';
import type { DeploymentStatus } from '@shepai/core/application/ports/output/services/deployment-service.interface';

export async function getDeploymentStatus(targetId: string): Promise<DeploymentStatus | null> {
  const useCase = resolve<GetDeploymentStatusUseCase>('GetDeploymentStatusUseCase');
  return useCase.execute(targetId);
}
