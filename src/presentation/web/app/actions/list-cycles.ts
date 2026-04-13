'use server';

import { resolve } from '@/lib/server-container';
import type { ListCyclesUseCase } from '@shepai/core/application/use-cases/cycles/list-cycles.use-case';
import type { Cycle } from '@shepai/core/domain/generated/output';

export async function listCycles(projectId: string): Promise<{ cycles?: Cycle[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ListCyclesUseCase>('ListCyclesUseCase');
    const cycles = await useCase.execute(projectId);
    return { cycles };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list cycles';
    return { error: message };
  }
}
