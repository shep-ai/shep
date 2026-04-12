'use server';

import { resolve } from '@/lib/server-container';
import type { ListActivityLogUseCase } from '@shepai/core/application/use-cases/activity-log/list-activity-log.use-case';
import type { ActivityEntry } from '@shepai/core/domain/generated/output';

export async function listActivityLog(
  workItemId: string
): Promise<{ entries?: ActivityEntry[]; error?: string }> {
  if (!workItemId?.trim()) {
    return { error: 'Work item ID is required' };
  }

  try {
    const useCase = resolve<ListActivityLogUseCase>('ListActivityLogUseCase');
    const entries = await useCase.execute(workItemId);
    return { entries };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list activity log';
    return { error: message };
  }
}
