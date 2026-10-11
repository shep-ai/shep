/**
 * Restore Feature Checkpoint Use Case (spec 138)
 *
 * Makes a feature's worktree match one of its checkpoints, when
 * CheckpointRestorePolicy allows it. A pre-restore checkpoint is captured
 * first, so a restore can be undone by restoring that one. The branch is never
 * moved: the rollback is an ordinary working-tree change on top of it.
 */

import { inject, injectable } from 'tsyringe';
import type { GitCheckpoint } from '../../../../domain/generated/output.js';
import { CheckpointRestoreRefusedError } from '../../../../domain/errors/git-checkpoint-errors.js';
import { resolveCheckpointSelector } from '../../../../domain/shared/git-checkpoint.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '../../../ports/output/services/git-checkpoint-service.interface.js';
import { CaptureFeatureCheckpointUseCase } from './capture-feature-checkpoint.use-case.js';
import { CheckpointRestorePolicy } from './checkpoint-restore-policy.js';
import { findFeatureOrThrow } from './find-feature.js';

export interface RestoreFeatureCheckpointInput {
  featureId: string;
  /** Sequence, node name or label of the checkpoint to restore. */
  step: string;
}

export interface RestoreFeatureCheckpointResult {
  restored: GitCheckpoint;
  /** Snapshot taken just before the restore; null when nothing had changed. */
  safety: GitCheckpoint | null;
}

@injectable()
export class RestoreFeatureCheckpointUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository,
    @inject('IGitCheckpointService') private readonly git: IGitCheckpointService,
    @inject(CheckpointRestorePolicy) private readonly policy: CheckpointRestorePolicy,
    @inject(CaptureFeatureCheckpointUseCase)
    private readonly capture: CaptureFeatureCheckpointUseCase
  ) {}

  async execute(input: RestoreFeatureCheckpointInput): Promise<RestoreFeatureCheckpointResult> {
    const feature = await findFeatureOrThrow(this.features, input.featureId);
    const target = resolveCheckpointSelector(
      await this.checkpoints.listByFeatureId(feature.id),
      input.step
    );
    const eligibility = await this.policy.evaluate(feature);
    if (!eligibility.allowed) {
      throw new CheckpointRestoreRefusedError(eligibility.blocker, eligibility.detail);
    }

    const { worktreePath } = eligibility;
    const safety = await this.capture.capturePreRestore({ featureId: feature.id, worktreePath });
    await this.git.restoreWorktree(worktreePath, target.treeSha);
    return { restored: target, safety };
  }
}
