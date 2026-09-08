'use server';

import { resolve } from '@/lib/server-container';
import type {
  AdaptiveModelPlan,
  GetAdaptiveModelPlanUseCase,
} from '@shepai/core/application/use-cases/settings/get-adaptive-model-plan.use-case';

export interface GetAdaptiveModelPlanResult {
  plan?: AdaptiveModelPlan;
  error?: string;
}

/**
 * Resolve which model each complexity tier maps to under the current settings.
 *
 * The whole computation lives in the use case — this action only translates a
 * thrown error into a shape the settings section can render, so the UI never
 * sees a raw 500.
 */
export async function getAdaptiveModelPlan(
  previewModel?: string
): Promise<GetAdaptiveModelPlanResult> {
  try {
    const useCase = resolve<GetAdaptiveModelPlanUseCase>('GetAdaptiveModelPlanUseCase');
    return { plan: await useCase.execute(previewModel) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to resolve the adaptive model plan';
    return { error: message };
  }
}
