'use server';

import { resolve } from '@/lib/server-container';
import type {
  CreateProjectFeatureInput,
  CreateProjectFeatureUseCase,
} from '@shepai/core/application/use-cases/features/create/create-project-feature.use-case';
import type { BuildMode, Feature } from '@shepai/core/domain/generated/output';
import { composeUserInput } from './compose-user-input';

interface NewProjectFeatureInput {
  description: string;
  attachments?: { path: string; name: string; notes?: string }[];
  agentType?: string;
  model?: string;
  /** Workflow to run. Omitted → the core default for new projects (spec-driven). */
  buildMode?: BuildMode;
}

/**
 * Start a brand-new project from a prompt on the Feature path: an empty
 * project folder plus a feature on it. Stack-agnostic — the prompt is sent
 * unchanged. All rules (naming, default mode) live in
 * CreateProjectFeatureUseCase; this action only maps input and runs the
 * background phase, like createFeature.
 */
export async function createProjectAndFeature(input: NewProjectFeatureInput): Promise<{
  feature?: Feature;
  repositoryPath?: string;
  error?: string;
}> {
  const description = input.description?.trim();
  if (!description) {
    return { error: 'Description is required' };
  }

  const useCaseInput: CreateProjectFeatureInput = {
    description,
    userInput: composeUserInput(description, input.attachments),
    ...(input.buildMode ? { buildMode: input.buildMode } : {}),
    ...(input.agentType ? { agentType: input.agentType } : {}),
    ...(input.model ? { model: input.model } : {}),
  };

  try {
    const useCase = resolve<CreateProjectFeatureUseCase>('CreateProjectFeatureUseCase');
    const { feature, shouldSpawn, repositoryPath } = await useCase.createRecord(useCaseInput);

    // Phase 2 (background): metadata, worktree, spec, agent spawn.
    useCase.initializeAndSpawn(feature, useCaseInput, shouldSpawn).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[createProjectAndFeature] initializeAndSpawn failed:', err);
    });

    return { feature, repositoryPath };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to create project' };
  }
}
