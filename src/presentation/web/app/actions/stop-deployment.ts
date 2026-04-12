'use server';

import { resolve } from '@/lib/server-container';
import type { StopDeploymentUseCase } from '@shepai/core/application/use-cases/deployments/stop-deployment.use-case';

export async function stopDeployment(
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const useCase = resolve<StopDeploymentUseCase>('StopDeploymentUseCase');
    await useCase.execute(targetId);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to stop deployment';
    return { success: false, error: message };
  }
}
