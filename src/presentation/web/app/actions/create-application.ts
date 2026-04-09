'use server';

import { resolve } from '@/lib/server-container';
import type { CreateApplicationUseCase } from '@shepai/core/application/use-cases/applications/create-application.use-case';
import type { Application } from '@shepai/core/domain/generated/output';

interface CreateApplicationInput {
  description: string;
  agentType?: string;
  modelOverride?: string;
  /**
   * When provided, the use case ALSO sends this as the first message of
   * the application's interactive chat session — wrapped server-side
   * with the full application-creation prompt (Shep persona, mission,
   * opinionated stack, workflow, quality bar, definition of done) by
   * the IApplicationCreationPromptBuilder adapter.
   *
   * Awaiting this BEFORE the client navigates guarantees that the chat
   * page's SSR load of chat state already includes the message — it
   * renders on first paint, no extra round trip.
   */
  initialPrompt?: string;
}

/**
 * Thin server-action wrapper around CreateApplicationUseCase.
 *
 * All orchestration (slug allocation, project scaffold, app persistence,
 * prompt building, first-message dispatch) lives inside the use case so
 * every presentation layer (Web / CLI / TUI) gets identical behavior
 * from a single call.
 */
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
      initialPrompt: input.initialPrompt,
    });
    return { application: result.application, repositoryPath: result.repositoryPath };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create application';
    return { error: message };
  }
}
