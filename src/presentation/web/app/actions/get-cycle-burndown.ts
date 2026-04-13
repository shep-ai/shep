'use server';

import { resolve } from '@/lib/server-container';
import type { GetCycleBurndownUseCase } from '@shepai/core/application/use-cases/analytics/get-cycle-burndown.use-case';
import type { CycleBurndownData } from '@shepai/core/application/use-cases/analytics/get-cycle-burndown.use-case';

export async function getCycleBurndown(
  cycleId: string
): Promise<{ data?: CycleBurndownData; error?: string }> {
  if (!cycleId?.trim()) {
    return { error: 'Cycle ID is required' };
  }

  try {
    const useCase = resolve<GetCycleBurndownUseCase>('GetCycleBurndownUseCase');
    const result = await useCase.execute(cycleId);
    if (!result.ok) return { error: result.error };
    return { data: result.data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get cycle burndown';
    return { error: message };
  }
}
