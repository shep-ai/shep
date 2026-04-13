'use server';

import { resolve } from '@/lib/server-container';
import type { LogTimeEntryUseCase } from '@shepai/core/application/use-cases/time-entries/log-time-entry.use-case';
import type { ListTimeEntriesUseCase } from '@shepai/core/application/use-cases/time-entries/list-time-entries.use-case';
import type { DeleteTimeEntryUseCase } from '@shepai/core/application/use-cases/time-entries/delete-time-entry.use-case';
import type { TimeEntry } from '@shepai/core/domain/generated/output';

export async function logTimeEntry(
  workItemId: string,
  durationMinutes: number,
  note?: string
): Promise<{ timeEntry?: TimeEntry; error?: string }> {
  try {
    const useCase = resolve<LogTimeEntryUseCase>('LogTimeEntryUseCase');
    const result = await useCase.execute(workItemId, durationMinutes, note);
    if (!result.ok) return { error: result.error };
    return { timeEntry: result.timeEntry };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to log time entry';
    return { error: message };
  }
}

export async function listTimeEntries(
  workItemId: string
): Promise<{ timeEntries?: TimeEntry[]; totalMinutes?: number; error?: string }> {
  try {
    const useCase = resolve<ListTimeEntriesUseCase>('ListTimeEntriesUseCase');
    const result = await useCase.execute(workItemId);
    return { timeEntries: result.timeEntries, totalMinutes: result.totalMinutes };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list time entries';
    return { error: message };
  }
}

export async function deleteTimeEntry(id: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeleteTimeEntryUseCase>('DeleteTimeEntryUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete time entry';
    return { error: message };
  }
}
