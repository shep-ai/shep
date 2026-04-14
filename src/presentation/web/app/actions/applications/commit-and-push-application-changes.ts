'use server';

import { resolve } from '@/lib/server-container';
import type { CommitAndPushApplicationChangesUseCase } from '@shepai/core/application/use-cases/applications/commit-and-push-application-changes.use-case';

export interface CommitAndPushApplicationChangesInput {
  applicationId: string;
  message: string;
}

export interface CommitAndPushApplicationChangesResult {
  committed?: boolean;
  pushed?: boolean;
  error?: string;
}

export async function commitAndPushApplicationChanges(
  input: CommitAndPushApplicationChangesInput
): Promise<CommitAndPushApplicationChangesResult> {
  if (!input.applicationId?.trim()) {
    return { error: 'Application ID is required' };
  }
  if (!input.message?.trim()) {
    return { error: 'Commit message is required' };
  }

  try {
    const useCase = resolve<CommitAndPushApplicationChangesUseCase>(
      'CommitAndPushApplicationChangesUseCase'
    );
    const result = await useCase.execute({
      applicationId: input.applicationId,
      message: input.message,
    });
    return { committed: result.committed, pushed: result.pushed };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to commit and push changes';
    return { error: message };
  }
}
