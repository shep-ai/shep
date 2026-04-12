'use server';

import { resolve } from '@/lib/server-container';
import type { GetApplicationUseCase } from '@shepai/core/application/use-cases/applications/get-application.use-case';
import type { IApplicationCreationPromptBuilder } from '@shepai/core/application/ports/output/services/application-creation-prompt-builder.interface';

export interface ApplicationDebugPromptResult {
  /** Shep brief — brand, role, mission, tech stack, workflow, quality
   *  bar, definition of done, workspace section. What the agent SDK
   *  gets as systemPrompt on every turn. */
  systemPrompt?: string;
  /** User-facing chat message — just the verbatim description. */
  userMessage?: string;
  /**
   * Convenience: `systemPrompt` + `---` + `userMessage`, suitable for
   * pasting into a clipboard / scratchpad / bug report.
   */
  combined?: string;
  error?: string;
}

/**
 * Rebuild the full application-creation prompt for an existing
 * application. Debug-only — lets the operator see exactly what Shep
 * handed to the agent on turn 1 of the session.
 *
 * The prompt is reconstructed from the stored description + repo path,
 * so it matches what `createApplication` would have generated at the
 * moment of creation (the builder is deterministic per input).
 */
export async function getApplicationDebugPrompt(
  applicationId: string
): Promise<ApplicationDebugPromptResult> {
  try {
    if (!applicationId?.trim()) {
      return { error: 'applicationId is required' };
    }

    const getApp = resolve<GetApplicationUseCase>('GetApplicationUseCase');
    const application = await getApp.execute(applicationId);
    if (!application) {
      return { error: 'Application not found' };
    }

    const builder = resolve<IApplicationCreationPromptBuilder>('IApplicationCreationPromptBuilder');

    const { systemPrompt, userMessage } = builder.build({
      description: application.description ?? '',
      workspace: {
        workingDirectory: application.repositoryPath,
        platform: process.platform === 'win32' ? 'windows' : 'posix',
      },
    });

    const combined = `# SYSTEM PROMPT\n\n${systemPrompt}\n\n---\n\n# USER MESSAGE\n\n${userMessage}\n`;

    return { systemPrompt, userMessage, combined };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build debug prompt';
    return { error: message };
  }
}
