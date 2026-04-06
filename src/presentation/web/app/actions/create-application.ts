'use server';

import { resolve } from '@/lib/server-container';
import type { CreateApplicationUseCase } from '@shepai/core/application/use-cases/applications/create-application.use-case';
import type { Application } from '@shepai/core/domain/generated/output';

interface CreateApplicationInput {
  description: string;
  agentType?: string;
  modelOverride?: string;
}

export async function createApplication(
  input: CreateApplicationInput
): Promise<{ application?: Application; repositoryPath?: string; error?: string }> {
  if (!input.description?.trim()) {
    return { error: 'Description is required' };
  }

  try {
    const useCase = resolve<CreateApplicationUseCase>('CreateApplicationUseCase');
    const result = await useCase.execute({
      description: input.description.trim(),
      agentType: input.agentType,
      modelOverride: input.modelOverride,
    });
    return { application: result.application, repositoryPath: result.repositoryPath };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create application';
    return { error: message };
  }
}
