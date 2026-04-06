'use server';

import { resolve } from '@/lib/server-container';
import type { CreateFeatureFromRemoteUseCase } from '@shepai/core/application/use-cases/features/create/create-feature-from-remote.use-case';
import type { Feature } from '@shepai/core/domain/generated/output';
import {
  GitHubAuthError,
  GitHubUrlParseError,
  GitHubCloneError,
} from '@shepai/core/application/ports/output/services/github-repository-service.interface';
import { composeUserInput } from './compose-user-input';

interface Attachment {
  path: string;
  name: string;
  notes?: string;
}

interface ApprovalGates {
  allowPrd: boolean;
  allowPlan: boolean;
  allowMerge: boolean;
}

interface CreateFeatureFromRemoteInput {
  /** GitHub URL or owner/repo shorthand */
  remoteUrl: string;
  description: string;
  attachments?: Attachment[];
  sessionId?: string;
  approvalGates?: {
    allowPrd: boolean;
    allowPlan: boolean;
    allowMerge?: boolean;
  };
  push?: boolean;
  openPr?: boolean;
  parentId?: string;
  fast?: boolean;
  pending?: boolean;
  agentType?: string;
  model?: string;
}

export async function createFeatureFromRemote(
  input: CreateFeatureFromRemoteInput
): Promise<{ feature?: Feature; error?: string }> {
  const {
    remoteUrl,
    description,
    attachments,
    sessionId,
    approvalGates,
    push,
    openPr,
    parentId,
    fast,
    pending,
    agentType,
    model,
  } = input;

  if (!remoteUrl?.trim()) {
    return { error: 'GitHub URL is required' };
  }

  if (!description?.trim()) {
    return { error: 'Description is required' };
  }

  const userInput = composeUserInput(description, attachments);
  const gates: ApprovalGates = {
    allowPrd: approvalGates?.allowPrd ?? false,
    allowPlan: approvalGates?.allowPlan ?? false,
    allowMerge: approvalGates?.allowMerge ?? false,
  };

  try {
    const useCase = resolve<CreateFeatureFromRemoteUseCase>('CreateFeatureFromRemoteUseCase');

    // Phase 1 (fast): import repo + create DB record — returns immediately
    const { feature, shouldSpawn } = await useCase.createRecord({
      remoteUrl,
      userInput,
      approvalGates: gates,
      push: push ?? false,
      openPr: openPr ?? false,
      ...(parentId ? { parentId } : {}),
      description,
      ...(fast ? { fast } : {}),
      ...(pending ? { pending } : {}),
      ...(agentType ? { agentType } : {}),
      ...(model ? { model } : {}),
    });

    // Phase 2 (background): metadata generation, worktree, spec, agent spawn
    useCase
      .initializeAndSpawn(
        feature,
        {
          remoteUrl,
          userInput,
          approvalGates: gates,
          push: push ?? false,
          openPr: openPr ?? false,
          ...(parentId ? { parentId } : {}),
          ...(fast ? { fast } : {}),
          ...(pending ? { pending } : {}),
          ...(agentType ? { agentType } : {}),
          ...(model ? { model } : {}),
          ...(sessionId ? { sessionId } : {}),
        },
        shouldSpawn
      )
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[createFeatureFromRemote] initializeAndSpawn failed:', err);
      });

    return { feature };
  } catch (error: unknown) {
    if (error instanceof GitHubAuthError) {
      return { error: 'GitHub CLI is not authenticated. Run `gh auth login` to sign in.' };
    }
    if (error instanceof GitHubUrlParseError) {
      return { error: `Invalid GitHub URL: ${error.message}` };
    }
    if (error instanceof GitHubCloneError) {
      return { error: `Clone failed: ${error.message}` };
    }
    const message = error instanceof Error ? error.message : 'Failed to create feature from remote';
    return { error: message };
  }
}
