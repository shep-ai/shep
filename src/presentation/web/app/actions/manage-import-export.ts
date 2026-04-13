'use server';

import { resolve } from '@/lib/server-container';
import type { ExportWorkItemsCsvUseCase } from '@shepai/core/application/use-cases/import-export/export-work-items-csv.use-case';
import type { ImportWorkItemsCsvUseCase } from '@shepai/core/application/use-cases/import-export/import-work-items-csv.use-case';
import type { ExportColumn } from '@shepai/core/application/use-cases/import-export/export-work-items-csv.use-case';

export async function exportWorkItemsCsv(input: {
  projectId: string;
  cycleId?: string;
  columns: ExportColumn[];
}): Promise<{ csv?: string; itemCount?: number; error?: string }> {
  try {
    const useCase = resolve<ExportWorkItemsCsvUseCase>('ExportWorkItemsCsvUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { csv: result.csv, itemCount: result.itemCount };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to export work items';
    return { error: message };
  }
}

export async function importWorkItemsCsv(input: {
  projectId: string;
  csvContent: string;
  fieldMapping: Record<number, string>;
  skipHeaderRow?: boolean;
}): Promise<{
  createdCount?: number;
  errors?: { rowNumber: number; error: string; value?: string }[];
  error?: string;
}> {
  try {
    const useCase = resolve<ImportWorkItemsCsvUseCase>('ImportWorkItemsCsvUseCase');
    const result = await useCase.execute({
      ...input,
      fieldMapping: input.fieldMapping as Record<
        number,
        'title' | 'description' | 'priority' | 'state' | 'estimateValue' | 'dueDate' | 'startDate'
      >,
    });
    if (!result.ok) return { error: result.error };
    return { createdCount: result.createdCount, errors: result.errors };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import work items';
    return { error: message };
  }
}
