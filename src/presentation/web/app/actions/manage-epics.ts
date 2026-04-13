'use server';

import { resolve } from '@/lib/server-container';
import type { CreateEpicUseCase } from '@shepai/core/application/use-cases/epics/create-epic.use-case';
import type { ListEpicsUseCase } from '@shepai/core/application/use-cases/epics/list-epics.use-case';
import type { UpdateEpicUseCase } from '@shepai/core/application/use-cases/epics/update-epic.use-case';
import type { DeleteEpicUseCase } from '@shepai/core/application/use-cases/epics/delete-epic.use-case';
import type { Epic, EpicStatus } from '@shepai/core/domain/generated/output';

export async function createEpic(input: {
  projectId: string;
  name: string;
  description?: string;
  status?: EpicStatus;
}): Promise<{ epic?: Epic; error?: string }> {
  try {
    const useCase = resolve<CreateEpicUseCase>('CreateEpicUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { epic: result.epic };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create epic';
    return { error: message };
  }
}

export async function listEpics(projectId: string): Promise<{ epics?: Epic[]; error?: string }> {
  try {
    const useCase = resolve<ListEpicsUseCase>('ListEpicsUseCase');
    const result = await useCase.execute(projectId);
    return { epics: result.epics };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list epics';
    return { error: message };
  }
}

export async function updateEpic(
  epicId: string,
  fields: { name?: string; description?: string; status?: EpicStatus }
): Promise<{ epic?: Epic; error?: string }> {
  try {
    const useCase = resolve<UpdateEpicUseCase>('UpdateEpicUseCase');
    const result = await useCase.execute({ epicId, ...fields });
    if (!result.ok) return { error: result.error };
    return { epic: result.epic };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update epic';
    return { error: message };
  }
}

export async function deleteEpic(epicId: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeleteEpicUseCase>('DeleteEpicUseCase');
    const result = await useCase.execute(epicId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete epic';
    return { error: message };
  }
}
