/**
 * Git Checkpoint Repository Port (spec 138)
 *
 * Persists the record of each hidden-ref checkpoint. The git objects and refs
 * themselves are managed by IGitCheckpointService.
 */

import type { GitCheckpoint } from '../../../../domain/generated/output.js';

export interface IGitCheckpointRepository {
  /**
   * Insert a checkpoint. Rejects when the feature already has a checkpoint
   * with the same sequence (UNIQUE(feature_id, sequence)).
   */
  create(checkpoint: GitCheckpoint): Promise<void>;

  /** Every checkpoint of a feature, ordered by sequence ascending. */
  listByFeatureId(featureId: string): Promise<GitCheckpoint[]>;

  /** Delete every checkpoint row of a feature; returns how many were deleted. */
  deleteByFeatureId(featureId: string): Promise<number>;
}
