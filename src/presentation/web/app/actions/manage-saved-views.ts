'use server';

import { resolve } from '@/lib/server-container';
import type {
  ManageSavedViewsUseCase,
  CreateSavedViewInput,
} from '@shepai/core/application/use-cases/saved-views/manage-saved-views.use-case';
import type { SavedView } from '@shepai/core/domain/generated/output';

export async function listSavedViews(
  projectId: string
): Promise<{ views?: SavedView[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ManageSavedViewsUseCase>('ManageSavedViewsUseCase');
    const views = await useCase.list(projectId);
    return { views };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list saved views';
    return { error: message };
  }
}

export async function createSavedView(
  input: CreateSavedViewInput
): Promise<{ view?: SavedView; error?: string }> {
  try {
    const useCase = resolve<ManageSavedViewsUseCase>('ManageSavedViewsUseCase');
    const result = await useCase.create(input);
    if (!result.ok) return { error: result.error };
    return { view: result.view };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create saved view';
    return { error: message };
  }
}

export async function updateSavedView(
  viewId: string,
  fields: Partial<Pick<SavedView, 'name' | 'description' | 'isPublic' | 'layout' | 'configuration'>>
): Promise<{ error?: string }> {
  if (!viewId?.trim()) {
    return { error: 'View ID is required' };
  }

  try {
    const useCase = resolve<ManageSavedViewsUseCase>('ManageSavedViewsUseCase');
    const result = await useCase.update(viewId, fields);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update saved view';
    return { error: message };
  }
}

export async function deleteSavedView(viewId: string): Promise<{ error?: string }> {
  if (!viewId?.trim()) {
    return { error: 'View ID is required' };
  }

  try {
    const useCase = resolve<ManageSavedViewsUseCase>('ManageSavedViewsUseCase');
    const result = await useCase.delete(viewId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete saved view';
    return { error: message };
  }
}
