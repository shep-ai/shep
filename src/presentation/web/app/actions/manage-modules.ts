'use server';

import { resolve } from '@/lib/server-container';
import type { CreateModuleUseCase } from '@shepai/core/application/use-cases/modules/create-module.use-case';
import type { UpdateModuleUseCase } from '@shepai/core/application/use-cases/modules/update-module.use-case';
import type { DeleteModuleUseCase } from '@shepai/core/application/use-cases/modules/delete-module.use-case';
import type { AddItemsToModuleUseCase } from '@shepai/core/application/use-cases/modules/add-items-to-module.use-case';
import type { RemoveItemsFromModuleUseCase } from '@shepai/core/application/use-cases/modules/remove-items-from-module.use-case';
import type { PmModule, ModuleStatus } from '@shepai/core/domain/generated/output';

export async function createModule(input: {
  projectId: string;
  name: string;
  description?: string;
  status?: ModuleStatus;
  leadId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ module?: PmModule; error?: string }> {
  if (!input.name?.trim()) {
    return { error: 'Module name is required' };
  }

  try {
    const useCase = resolve<CreateModuleUseCase>('CreateModuleUseCase');
    const result = await useCase.execute({
      ...input,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    if (!result.ok) return { error: result.error };
    return { module: result.module };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create module';
    return { error: message };
  }
}

export async function updateModule(
  moduleId: string,
  fields: Record<string, unknown>
): Promise<{ module?: PmModule; error?: string }> {
  try {
    const useCase = resolve<UpdateModuleUseCase>('UpdateModuleUseCase');
    const result = await useCase.execute(moduleId, fields);
    if (!result.ok) return { error: result.error };
    return { module: result.module };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update module';
    return { error: message };
  }
}

export async function deleteModule(moduleId: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeleteModuleUseCase>('DeleteModuleUseCase');
    const result = await useCase.execute(moduleId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete module';
    return { error: message };
  }
}

export async function addItemsToModule(
  moduleId: string,
  workItemIds: string[]
): Promise<{ added?: number; error?: string }> {
  try {
    const useCase = resolve<AddItemsToModuleUseCase>('AddItemsToModuleUseCase');
    const result = await useCase.execute(moduleId, workItemIds);
    if (!result.ok) return { error: result.error };
    return { added: result.added };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add items to module';
    return { error: message };
  }
}

export async function removeItemsFromModule(
  moduleId: string,
  workItemIds: string[]
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<RemoveItemsFromModuleUseCase>('RemoveItemsFromModuleUseCase');
    const result = await useCase.execute(moduleId, workItemIds);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove items from module';
    return { error: message };
  }
}
