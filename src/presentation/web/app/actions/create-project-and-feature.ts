'use server';

import { resolve } from '@/lib/server-container';
import type {
  StartApplicationInput,
  StartApplicationUseCase,
} from '@shepai/core/application/use-cases/applications/start-application.use-case';
import type { Application, BuildMode, Feature } from '@shepai/core/domain/generated/output';
import { composeUserInput } from './compose-user-input';

interface NewProjectFeatureInput {
  description: string;
  attachments?: { path: string; name: string; notes?: string }[];
  agentType?: string;
  model?: string;
  /** Workflow of the app's first feature. Omitted → spec-driven (core default). */
  buildMode?: BuildMode;
}

/**
 * Start a new app from a prompt on the stack-agnostic path: an empty project,
 * an Application, and its first feature. All rules live in
 * StartApplicationUseCase; this action maps input and lets the first
 * feature's setup continue in the background.
 */
export async function createProjectAndFeature(input: NewProjectFeatureInput): Promise<{
  application?: Application;
  feature?: Feature;
  repositoryPath?: string;
  error?: string;
}> {
  const description = input.description?.trim();
  if (!description) {
    return { error: 'Description is required' };
  }

  const useCaseInput: StartApplicationInput = {
    description,
    userInput: composeUserInput(description, input.attachments),
    ...(input.buildMode ? { buildMode: input.buildMode } : {}),
    ...(input.agentType ? { agentType: input.agentType } : {}),
    ...(input.model ? { model: input.model } : {}),
  };

  try {
    const useCase = resolve<StartApplicationUseCase>('StartApplicationUseCase');
    const { application, feature, repositoryPath } = await useCase.execute(useCaseInput, {
      awaitFeatureSetup: false,
    });
    return { application, feature, repositoryPath };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to create project' };
  }
}
