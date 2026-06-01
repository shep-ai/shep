'use server';

import { resolve } from '@/lib/server-container';
import type { UpdateSdlcSubTaskStatusUseCase } from '@shepai/core/application/use-cases/sdlc-board/update-sdlc-subtask-status.use-case';
import type { TaskState } from '@shepai/core/domain/generated/output';

export async function updateSdlcSubTaskStatus(
  subTaskId: string,
  status: TaskState
): Promise<{ error?: string }> {
  if (!subTaskId?.trim()) {
    return { error: 'Sub-task ID is required' };
  }

  try {
    const useCase = resolve<UpdateSdlcSubTaskStatusUseCase>('UpdateSdlcSubTaskStatusUseCase');
    await useCase.execute({ subTaskId, status });
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update sub-task status';
    return { error: message };
  }
}
