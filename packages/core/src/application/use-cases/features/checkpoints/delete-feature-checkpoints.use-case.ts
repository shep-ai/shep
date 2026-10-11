/**
 * Delete Feature Checkpoints Use Case (spec 135)
 *
 * Removes a feature's hidden refs and their rows. Called when the feature's
 * worktree is removed or the feature is archived. Runs git from the
 * repository path because the worktree may already be gone.
 */

import { inject, injectable } from 'tsyringe';
import { featureCheckpointRefPrefix } from '../../../../domain/shared/git-checkpoint.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '../../../ports/output/services/git-checkpoint-service.interface.js';

export interface DeleteFeatureCheckpointsInput {
  featureId: string;
  repositoryPath: string;
}

@injectable()
export class DeleteFeatureCheckpointsUseCase {
  constructor(
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository,
    @inject('IGitCheckpointService') private readonly git: IGitCheckpointService
  ) {}

  /** Returns how many refs were deleted. */
  async execute(input: DeleteFeatureCheckpointsInput): Promise<number> {
    const prefix = featureCheckpointRefPrefix(input.featureId);
    try {
      return await this.git.deleteRefs(input.repositoryPath, prefix);
    } finally {
      // Rows go even when git failed: the refs are found by prefix, not
      // through the rows, and a row for a deleted ref would list a step that
      // cannot be diffed.
      await this.checkpoints.deleteByFeatureId(input.featureId);
    }
  }
}
