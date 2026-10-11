'use server';

import { resolve } from '@/lib/server-container';
import { FEATURE_OFF_ERROR, isFeatureOn } from '@/lib/feature-gate';
import type { UpdateSdlcTaskStatusUseCase } from '@shepai/core/application/use-cases/sdlc-board/update-sdlc-task-status.use-case';
import type { TaskState } from '@shepai/core/domain/generated/output';

export async function updateSdlcTaskStatus(
  taskId: string,
  status: TaskState
): Promise<{ error?: string }> {
  if (!isFeatureOn('sdlcBoard')) return { error: FEATURE_OFF_ERROR };
  if (!taskId?.trim()) {
    return { error: 'Task ID is required' };
  }

  try {
    const useCase = resolve<UpdateSdlcTaskStatusUseCase>('UpdateSdlcTaskStatusUseCase');
    await useCase.execute({ taskId, status });
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update task status';
    return { error: message };
  }
}
