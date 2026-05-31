'use server';

import { resolve } from '@/lib/server-container';
import type { ReorderSdlcTaskUseCase } from '@shepai/core/application/use-cases/sdlc-board/reorder-sdlc-task.use-case';

export async function reorderSdlcTask(
  taskId: string,
  sortOrder: number
): Promise<{ error?: string }> {
  if (!taskId?.trim()) {
    return { error: 'Task ID is required' };
  }

  try {
    const useCase = resolve<ReorderSdlcTaskUseCase>('ReorderSdlcTaskUseCase');
    await useCase.execute({ taskId, sortOrder });
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reorder task';
    return { error: message };
  }
}
