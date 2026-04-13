'use server';

import { resolve } from '@/lib/server-container';
import type { GetAiCycleSummaryUseCase } from '@shepai/core/application/use-cases/analytics/get-ai-cycle-summary.use-case';
import type { GetAiProjectHealthUseCase } from '@shepai/core/application/use-cases/analytics/get-ai-project-health.use-case';

export async function getAiCycleSummary(cycleId: string): Promise<{
  summary?: {
    cycleName: string;
    totalItems: number;
    completedItems: number;
    inProgressItems: number;
    notStartedItems: number;
    completionPercentage: number;
    aiSummary: string;
    risks?: string[];
  };
  error?: string;
}> {
  try {
    const useCase = resolve<GetAiCycleSummaryUseCase>('GetAiCycleSummaryUseCase');
    const result = await useCase.execute({ cycleId });
    if (!result.ok) return { error: result.error };
    return { summary: result.summary };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get cycle summary';
    return { error: message };
  }
}

export async function getAiProjectHealth(projectId: string): Promise<{
  health?: {
    projectName: string;
    totalItems: number;
    completedItems: number;
    inProgressItems: number;
    notStartedItems: number;
    completionPercentage: number;
    activeCycles: number;
    totalCycles: number;
    aiSummary: string;
    recommendations?: string[];
  };
  error?: string;
}> {
  try {
    const useCase = resolve<GetAiProjectHealthUseCase>('GetAiProjectHealthUseCase');
    const result = await useCase.execute({ projectId });
    if (!result.ok) return { error: result.error };
    return { health: result.health };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get project health';
    return { error: message };
  }
}
