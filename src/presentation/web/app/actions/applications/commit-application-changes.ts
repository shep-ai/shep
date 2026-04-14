'use server';

import { resolve } from '@/lib/server-container';
import type { CommitApplicationChangesUseCase } from '@shepai/core/application/use-cases/applications/commit-application-changes.use-case';

export interface CommitApplicationChangesInput {
  applicationId: string;
  message: string;
}

export interface CommitApplicationChangesResult {
  committed?: boolean;
  error?: string;
}

export async function commitApplicationChanges(
  input: CommitApplicationChangesInput
): Promise<CommitApplicationChangesResult> {
  if (!input.applicationId?.trim()) {
    return { error: 'Application ID is required' };
  }
  if (!input.message?.trim()) {
    return { error: 'Commit message is required' };
  }

  try {
    const useCase = resolve<CommitApplicationChangesUseCase>('CommitApplicationChangesUseCase');
    const result = await useCase.execute({
      applicationId: input.applicationId,
      message: input.message,
    });
    return { committed: result.committed };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to commit changes';
    return { error: message };
  }
}
