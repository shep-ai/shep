'use server';

/**
 * Server actions for feature checkpoints (spec 135). Each resolves one use
 * case by string token; the guards (which worktree, agent running) live in core.
 */

import { resolve } from '@/lib/server-container';
import { attemptResult, type ActionResult } from '@/lib/action-outcome';
import type {
  FeatureCheckpointList,
  ListFeatureCheckpointsUseCase,
} from '@shepai/core/application/use-cases/features/checkpoints/list-feature-checkpoints.use-case';
import type {
  FeatureCheckpointDiff,
  GetFeatureCheckpointDiffInput,
  GetFeatureCheckpointDiffUseCase,
} from '@shepai/core/application/use-cases/features/checkpoints/get-feature-checkpoint-diff.use-case';
import type {
  RestoreFeatureCheckpointInput,
  RestoreFeatureCheckpointResult,
  RestoreFeatureCheckpointUseCase,
} from '@shepai/core/application/use-cases/features/checkpoints/restore-feature-checkpoint.use-case';

export async function listFeatureCheckpoints(
  featureId: string
): Promise<ActionResult<FeatureCheckpointList>> {
  return attemptResult(() =>
    resolve<ListFeatureCheckpointsUseCase>('ListFeatureCheckpointsUseCase').execute(featureId)
  );
}

export async function getFeatureCheckpointDiff(
  input: GetFeatureCheckpointDiffInput
): Promise<ActionResult<FeatureCheckpointDiff>> {
  return attemptResult(() =>
    resolve<GetFeatureCheckpointDiffUseCase>('GetFeatureCheckpointDiffUseCase').execute(input)
  );
}

export async function restoreFeatureCheckpoint(
  input: RestoreFeatureCheckpointInput
): Promise<ActionResult<RestoreFeatureCheckpointResult>> {
  return attemptResult(() =>
    resolve<RestoreFeatureCheckpointUseCase>('RestoreFeatureCheckpointUseCase').execute(input)
  );
}
