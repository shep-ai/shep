'use server';

import { resolve } from '@/lib/server-container';
import type {
  ManageWorkItemStatesUseCase,
  CreateWorkItemStateInput,
} from '@shepai/core/application/use-cases/work-item-states/manage-work-item-states.use-case';
import type { WorkItemState } from '@shepai/core/domain/generated/output';

export async function listWorkItemStates(
  projectId: string
): Promise<{ states?: WorkItemState[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase');
    const states = await useCase.list(projectId);
    return { states };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list states';
    return { error: message };
  }
}

export async function createWorkItemState(
  input: CreateWorkItemStateInput
): Promise<{ state?: WorkItemState; error?: string }> {
  try {
    const useCase = resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase');
    const result = await useCase.create(input);
    if (!result.ok) return { error: result.error };
    return { state: result.state };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create state';
    return { error: message };
  }
}

export async function updateWorkItemState(
  stateId: string,
  fields: Partial<
    Pick<WorkItemState, 'name' | 'color' | 'displayOrder' | 'stateGroup' | 'isDefault'>
  >
): Promise<{ error?: string }> {
  if (!stateId?.trim()) {
    return { error: 'State ID is required' };
  }

  try {
    const useCase = resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase');
    const result = await useCase.update(stateId, fields);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update state';
    return { error: message };
  }
}

export async function deleteWorkItemState(stateId: string): Promise<{ error?: string }> {
  if (!stateId?.trim()) {
    return { error: 'State ID is required' };
  }

  try {
    const useCase = resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase');
    const result = await useCase.delete(stateId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete state';
    return { error: message };
  }
}

export async function reorderWorkItemStates(
  states: { id: string; displayOrder: number }[]
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase');
    const result = await useCase.reorder(states);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reorder states';
    return { error: message };
  }
}
