'use server';

import { resolve } from '@/lib/server-container';
import { getFeatureFlags } from '@/lib/feature-flags';
import type { GetScheduledWorkflowHistoryUseCase as GetWorkflowHistoryUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/get-scheduled-workflow-history.use-case';
import type { WorkflowExecution } from '@shepai/core/domain/generated/output';

export interface GetWorkflowHistoryResult {
  executions?: WorkflowExecution[];
  error?: string;
}

export async function getWorkflowHistory(
  workflowId: string,
  limit?: number
): Promise<GetWorkflowHistoryResult> {
  if (!getFeatureFlags().scheduledWorkflows) {
    return { executions: [] };
  }

  try {
    const useCase = resolve<GetWorkflowHistoryUseCase>('GetWorkflowHistoryUseCase');
    const executions = await useCase.execute(workflowId, undefined, limit);
    return { executions };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get workflow history';
    return { error: message };
  }
}
