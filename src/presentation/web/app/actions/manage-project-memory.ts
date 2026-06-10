'use server';

import { resolve } from '@/lib/server-container';
import type { ManageProjectMemoryUseCase } from '@shepai/core/application/use-cases/project-memory/manage-project-memory.use-case';
import type { ProjectMemory, MemoryScope } from '@shepai/core/domain/generated/output';

export async function listProjectMemory(
  repositoryPath?: string
): Promise<{ entries?: ProjectMemory[]; error?: string }> {
  try {
    const useCase = resolve<ManageProjectMemoryUseCase>('ManageProjectMemoryUseCase');
    const entries = await useCase.list(repositoryPath);
    return { entries };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list project memory';
    return { error: message };
  }
}

export async function updateProjectMemory(
  id: string,
  content: string
): Promise<{ memory?: ProjectMemory; error?: string }> {
  if (!id?.trim()) {
    return { error: 'Memory id is required' };
  }

  try {
    const useCase = resolve<ManageProjectMemoryUseCase>('ManageProjectMemoryUseCase');
    const result = await useCase.update(id, content);
    if (!result.ok) return { error: result.error };
    return { memory: result.memory };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update project memory';
    return { error: message };
  }
}

export async function setProjectMemoryScope(
  id: string,
  scope: MemoryScope
): Promise<{ memory?: ProjectMemory; error?: string }> {
  if (!id?.trim()) {
    return { error: 'Memory id is required' };
  }

  try {
    const useCase = resolve<ManageProjectMemoryUseCase>('ManageProjectMemoryUseCase');
    const result = await useCase.setScope(id, scope);
    if (!result.ok) return { error: result.error };
    return { memory: result.memory };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update memory scope';
    return { error: message };
  }
}

export async function deleteProjectMemory(id: string): Promise<{ error?: string }> {
  if (!id?.trim()) {
    return { error: 'Memory id is required' };
  }

  try {
    const useCase = resolve<ManageProjectMemoryUseCase>('ManageProjectMemoryUseCase');
    const result = await useCase.delete(id);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete project memory';
    return { error: message };
  }
}
