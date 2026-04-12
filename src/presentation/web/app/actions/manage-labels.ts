'use server';

import { resolve } from '@/lib/server-container';
import type {
  ManageLabelsUseCase,
  CreateLabelInput,
} from '@shepai/core/application/use-cases/labels/manage-labels.use-case';
import type { Label } from '@shepai/core/domain/generated/output';

export async function listLabels(projectId: string): Promise<{ labels?: Label[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ManageLabelsUseCase>('ManageLabelsUseCase');
    const labels = await useCase.list(projectId);
    return { labels };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list labels';
    return { error: message };
  }
}

export async function createLabel(
  input: CreateLabelInput
): Promise<{ label?: Label; error?: string }> {
  try {
    const useCase = resolve<ManageLabelsUseCase>('ManageLabelsUseCase');
    const result = await useCase.create(input);
    if (!result.ok) return { error: result.error };
    return { label: result.label };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create label';
    return { error: message };
  }
}

export async function updateLabel(
  labelId: string,
  fields: Partial<Pick<Label, 'name' | 'color' | 'parentId'>>
): Promise<{ error?: string }> {
  if (!labelId?.trim()) {
    return { error: 'Label ID is required' };
  }

  try {
    const useCase = resolve<ManageLabelsUseCase>('ManageLabelsUseCase');
    const result = await useCase.update(labelId, fields);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update label';
    return { error: message };
  }
}

export async function deleteLabel(labelId: string): Promise<{ error?: string }> {
  if (!labelId?.trim()) {
    return { error: 'Label ID is required' };
  }

  try {
    const useCase = resolve<ManageLabelsUseCase>('ManageLabelsUseCase');
    const result = await useCase.delete(labelId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete label';
    return { error: message };
  }
}
