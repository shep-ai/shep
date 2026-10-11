/**
 * Get Feature Checkpoint Diff Use Case (spec 135)
 *
 * What one step changed (`to` alone: diffed against the step before it), or
 * the difference between any two steps (`from` and `to`). Steps are selected
 * by sequence, node name or label; see resolveCheckpointSelector.
 */

import { inject, injectable } from 'tsyringe';
import type { GitCheckpoint } from '../../../../domain/generated/output.js';
import {
  checkpointLabel,
  previousCheckpoint,
  resolveCheckpointSelector,
} from '../../../../domain/shared/git-checkpoint.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '../../../ports/output/services/git-checkpoint-service.interface.js';
import type { FileDiff } from '../../../ports/output/services/git-pr-service.interface.js';
import { findFeatureOrThrow } from './find-feature.js';

export interface GetFeatureCheckpointDiffInput {
  featureId: string;
  /** Omitted: the checkpoint immediately before `to`. */
  from?: string;
  to: string;
}

export interface FeatureCheckpointDiff {
  from: GitCheckpoint;
  to: GitCheckpoint;
  files: FileDiff[];
  filesChanged: number;
  additions: number;
  deletions: number;
}

@injectable()
export class GetFeatureCheckpointDiffUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository,
    @inject('IGitCheckpointService') private readonly git: IGitCheckpointService
  ) {}

  async execute(input: GetFeatureCheckpointDiffInput): Promise<FeatureCheckpointDiff> {
    const feature = await findFeatureOrThrow(this.features, input.featureId);
    const all = await this.checkpoints.listByFeatureId(feature.id);
    const to = resolveCheckpointSelector(all, input.to);
    const from =
      input.from !== undefined
        ? resolveCheckpointSelector(all, input.from)
        : previousCheckpoint(all, to);
    if (!from) {
      throw new Error(
        `${checkpointLabel(to)} is the first checkpoint; there is nothing before it to compare with.`
      );
    }

    // Checkpoint objects live in the repository's shared object store, so the
    // main checkout can read them even after the worktree is gone.
    const files = await this.git.diff(feature.repositoryPath, from.commitSha, to.commitSha);
    return {
      from,
      to,
      files,
      filesChanged: files.length,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    };
  }
}
