'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import { getFeatureFlags } from '@/lib/feature-flags';
import type { ToggleScheduledWorkflowUseCase as ToggleWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/toggle-scheduled-workflow.use-case';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output';

export interface ToggleWorkflowResult {
  workflow?: ScheduledWorkflow;
  success: boolean;
  error?: string;
}

export async function toggleWorkflow(
  workflowId: string,
  enabled: boolean
): Promise<ToggleWorkflowResult> {
  if (!getFeatureFlags().scheduledWorkflows) {
    return { success: false, error: 'Scheduled workflows feature is not enabled' };
  }

  try {
    const useCase = resolve<ToggleWorkflowUseCase>('ToggleWorkflowUseCase');
    const workflow = await useCase.execute(workflowId, enabled);
    revalidatePath('/workflows');
    return { workflow, success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to toggle workflow';
    return { success: false, error: message };
  }
}
