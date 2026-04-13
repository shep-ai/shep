'use server';

import { resolve } from '@/lib/server-container';
import type { CreateCycleUseCase } from '@shepai/core/application/use-cases/cycles/create-cycle.use-case';
import type { UpdateCycleUseCase } from '@shepai/core/application/use-cases/cycles/update-cycle.use-case';
import type { DeleteCycleUseCase } from '@shepai/core/application/use-cases/cycles/delete-cycle.use-case';
import type { AddItemsToCycleUseCase } from '@shepai/core/application/use-cases/cycles/add-items-to-cycle.use-case';
import type { RemoveItemsFromCycleUseCase } from '@shepai/core/application/use-cases/cycles/remove-items-from-cycle.use-case';
import type { TransferCycleItemsUseCase } from '@shepai/core/application/use-cases/cycles/transfer-cycle-items.use-case';
import type { Cycle, CycleStatus } from '@shepai/core/domain/generated/output';

export async function createCycle(input: {
  projectId: string;
  name: string;
  description?: string;
  status?: CycleStatus;
  startDate?: string;
  endDate?: string;
}): Promise<{ cycle?: Cycle; error?: string }> {
  if (!input.name?.trim()) {
    return { error: 'Cycle name is required' };
  }

  try {
    const useCase = resolve<CreateCycleUseCase>('CreateCycleUseCase');
    const result = await useCase.execute({
      ...input,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    if (!result.ok) return { error: result.error };
    return { cycle: result.cycle };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create cycle';
    return { error: message };
  }
}

export async function updateCycle(
  cycleId: string,
  fields: Record<string, unknown>
): Promise<{ cycle?: Cycle; error?: string }> {
  try {
    const useCase = resolve<UpdateCycleUseCase>('UpdateCycleUseCase');
    const result = await useCase.execute(cycleId, fields);
    if (!result.ok) return { error: result.error };
    return { cycle: result.cycle };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update cycle';
    return { error: message };
  }
}

export async function deleteCycle(cycleId: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeleteCycleUseCase>('DeleteCycleUseCase');
    const result = await useCase.execute(cycleId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete cycle';
    return { error: message };
  }
}

export async function addItemsToCycle(
  cycleId: string,
  workItemIds: string[]
): Promise<{ added?: number; error?: string }> {
  try {
    const useCase = resolve<AddItemsToCycleUseCase>('AddItemsToCycleUseCase');
    const result = await useCase.execute(cycleId, workItemIds);
    if (!result.ok) return { error: result.error };
    return { added: result.added };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add items to cycle';
    return { error: message };
  }
}

export async function removeItemsFromCycle(
  cycleId: string,
  workItemIds: string[]
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<RemoveItemsFromCycleUseCase>('RemoveItemsFromCycleUseCase');
    const result = await useCase.execute(cycleId, workItemIds);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove items from cycle';
    return { error: message };
  }
}

export async function transferCycleItems(
  sourceCycleId: string,
  targetCycleId?: string
): Promise<{ transferred?: number; kept?: number; error?: string }> {
  try {
    const useCase = resolve<TransferCycleItemsUseCase>('TransferCycleItemsUseCase');
    const result = await useCase.execute({ sourceCycleId, targetCycleId });
    if (!result.ok) return { error: result.error };
    return { transferred: result.transferred, kept: result.kept };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to transfer cycle items';
    return { error: message };
  }
}
