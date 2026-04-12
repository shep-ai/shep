'use server';

import { resolve } from '@/lib/server-container';
import type {
  BulkUpdateWorkItemsUseCase,
  BulkUpdateWorkItemsInput,
  BulkUpdateResult,
} from '@shepai/core/application/use-cases/work-items/bulk-update-work-items.use-case';

export async function bulkUpdateWorkItems(
  input: BulkUpdateWorkItemsInput
): Promise<BulkUpdateResult & { error?: string }> {
  try {
    const useCase = resolve<BulkUpdateWorkItemsUseCase>('BulkUpdateWorkItemsUseCase');
    return await useCase.execute(input);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to perform bulk update';
    return { ok: false, succeeded: [], failed: [], error: message };
  }
}
