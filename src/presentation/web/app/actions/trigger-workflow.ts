'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import { getFeatureFlags } from '@/lib/feature-flags';
import type { RunScheduledWorkflowUseCase as RunWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/run-scheduled-workflow.use-case';
import type { WorkflowExecution } from '@shepai/core/domain/generated/output';

export interface TriggerWorkflowResult {
  execution?: WorkflowExecution;
  success: boolean;
  error?: string;
}

export async function triggerWorkflow(workflowId: string): Promise<TriggerWorkflowResult> {
  if (!getFeatureFlags().scheduledWorkflows) {
    return { success: false, error: 'Scheduled workflows feature is not enabled' };
  }

  try {
    const useCase = resolve<RunWorkflowUseCase>('RunWorkflowUseCase');
    const execution = await useCase.execute(workflowId);
    revalidatePath('/workflows');
    return { execution, success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to trigger workflow';
    return { success: false, error: message };
  }
}
