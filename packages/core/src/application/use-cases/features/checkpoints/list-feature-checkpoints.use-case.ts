/**
 * List Feature Checkpoints Use Case (spec 138)
 *
 * The steps a feature's run recorded, oldest first, and whether the worktree
 * can be restored to one of them right now.
 */

import { inject, injectable } from 'tsyringe';
import type {
  CheckpointRestoreBlocker,
  GitCheckpoint,
} from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import { CheckpointRestorePolicy } from './checkpoint-restore-policy.js';
import { findFeatureOrThrow } from './find-feature.js';

export interface FeatureCheckpointList {
  featureId: string;
  featureName: string;
  checkpoints: GitCheckpoint[];
  /** Why a restore would be refused right now; absent when it is allowed. */
  restoreBlocker?: CheckpointRestoreBlocker;
}

@injectable()
export class ListFeatureCheckpointsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository,
    @inject(CheckpointRestorePolicy) private readonly restorePolicy: CheckpointRestorePolicy
  ) {}

  async execute(featureId: string): Promise<FeatureCheckpointList> {
    const feature = await findFeatureOrThrow(this.features, featureId);
    const [checkpoints, eligibility] = await Promise.all([
      this.checkpoints.listByFeatureId(feature.id),
      this.restorePolicy.evaluate(feature),
    ]);
    return {
      featureId: feature.id,
      featureName: feature.name,
      checkpoints,
      ...(eligibility.allowed ? {} : { restoreBlocker: eligibility.blocker }),
    };
  }
}
