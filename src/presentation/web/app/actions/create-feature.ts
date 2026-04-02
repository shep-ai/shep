'use server';

import { resolve } from '@/lib/server-container';
import type { CreateFeatureUseCase } from '@shepai/core/application/use-cases/features/create/create-feature.use-case';
import type { Feature } from '@shepai/core/domain/generated/output';
import { type FeatureMode } from '@shepai/core/domain/generated/output';
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

interface CreateFeatureInput {
  description: string;
  repositoryPath: string;
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
  /** Execution mode: Regular (full SDLC), Fast (direct implementation), or Exploration (iterative prototyping). */
  mode?: FeatureMode;
  /** When true, create the feature in pending state (no agent spawned). */
  pending?: boolean;
  /** Fork repo and create PR to upstream at merge time. */
  forkAndPr?: boolean;
  /** Commit specs/evidences into the repo (default: true, auto-false when forkAndPr). */
  commitSpecs?: boolean;
  /** Enable CI watch/fix loop after push. */
  ciWatchEnabled?: boolean;
  /** Enable evidence collection after implementation. */
  enableEvidence?: boolean;
  /** Commit evidence to PR. */
  commitEvidence?: boolean;
  /** Optional agent type override for this feature run */
  agentType?: string;
  /** Optional model identifier for this feature run */
  model?: string;
  /** Sync main from remote before creating the feature branch (default: true). */
  rebaseBeforeBranch?: boolean;
  /** Inject curated skills into the feature worktree. */
  injectSkills?: boolean;
}

export async function createFeature(
  input: CreateFeatureInput
): Promise<{ feature?: Feature; error?: string }> {
  const {
    description,
    repositoryPath,
    attachments,
    sessionId,
    approvalGates,
    push,
    openPr,
    parentId,
    mode,
    pending,
    forkAndPr,
    commitSpecs,
    ciWatchEnabled,
    enableEvidence,
    commitEvidence,
    agentType,
    model,
    rebaseBeforeBranch,
    injectSkills,
  } = input;

  if (!description?.trim()) {
    return { error: 'description is required' };
  }

  if (!repositoryPath?.trim()) {
    return { error: 'repositoryPath is required' };
  }

  const userInput = composeUserInput(description, attachments);
  const gates: ApprovalGates = {
    allowPrd: approvalGates?.allowPrd ?? false,
    allowPlan: approvalGates?.allowPlan ?? false,
    allowMerge: approvalGates?.allowMerge ?? false,
  };

  try {
    const createFeatureUseCase = resolve<CreateFeatureUseCase>('CreateFeatureUseCase');

    // Phase 1 (fast): create DB record with real UUID — returns immediately
    const { feature, shouldSpawn } = await createFeatureUseCase.createRecord({
      userInput,
      repositoryPath,
      approvalGates: gates,
      push: push ?? false,
      openPr: openPr ?? false,
      ...(parentId ? { parentId } : {}),
      description,
      ...(mode ? { mode } : {}),
      ...(pending ? { pending } : {}),
      ...(forkAndPr != null ? { forkAndPr } : {}),
      ...(commitSpecs != null ? { commitSpecs } : {}),
      ...(ciWatchEnabled != null ? { ciWatchEnabled } : {}),
      ...(enableEvidence != null ? { enableEvidence } : {}),
      ...(commitEvidence != null ? { commitEvidence } : {}),
      ...(agentType ? { agentType } : {}),
      ...(model ? { model } : {}),
      ...(rebaseBeforeBranch != null ? { rebaseBeforeBranch } : {}),
      ...(injectSkills != null ? { injectSkills } : {}),
    });

    // Phase 2 (background): metadata generation, worktree, spec, agent spawn
    // Fire-and-forget — the UI gets the real feature ID immediately
    createFeatureUseCase
      .initializeAndSpawn(
        feature,
        {
          userInput,
          repositoryPath,
          approvalGates: gates,
          push: push ?? false,
          openPr: openPr ?? false,
          ...(parentId ? { parentId } : {}),
          ...(mode ? { mode } : {}),
          ...(pending ? { pending } : {}),
          ...(forkAndPr != null ? { forkAndPr } : {}),
          ...(commitSpecs != null ? { commitSpecs } : {}),
          ...(ciWatchEnabled != null ? { ciWatchEnabled } : {}),
          ...(enableEvidence != null ? { enableEvidence } : {}),
          ...(commitEvidence != null ? { commitEvidence } : {}),
          ...(agentType ? { agentType } : {}),
          ...(model ? { model } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(rebaseBeforeBranch != null ? { rebaseBeforeBranch } : {}),
          ...(injectSkills != null ? { injectSkills } : {}),
        },
        shouldSpawn
      )
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[createFeature] initializeAndSpawn failed:', err);
      });

    return { feature };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create feature';
    return { error: message };
  }
}
