/**
 * List Feature Checkpoints Use Case (spec 135)
 *
 * The steps a feature's run recorded, oldest first.
 */

import { inject, injectable } from 'tsyringe';
import type { GitCheckpoint } from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import { findFeatureOrThrow } from './find-feature.js';

export interface FeatureCheckpointList {
  featureId: string;
  featureName: string;
  checkpoints: GitCheckpoint[];
}

@injectable()
export class ListFeatureCheckpointsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository
  ) {}

  async execute(featureId: string): Promise<FeatureCheckpointList> {
    const feature = await findFeatureOrThrow(this.features, featureId);
    return {
      featureId: feature.id,
      featureName: feature.name,
      checkpoints: await this.checkpoints.listByFeatureId(feature.id),
    };
  }
}
