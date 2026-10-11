/**
 * Restore Feature Checkpoint Use Case (spec 135)
 *
 * Makes a feature's worktree match one of its checkpoints. Guarded on three
 * independent conditions, because the one thing this must never do is write
 * to the user's own checkout:
 *
 * 1. the feature has a worktree path, and it is not the repository path;
 * 2. git itself reports that directory as a linked worktree;
 * 3. the feature's latest agent run is not pending or running.
 *
 * A pre-restore checkpoint is captured first, so a restore can be undone by
 * restoring that one. The branch is never moved: the rollback is an ordinary
 * working-tree change on top of it.
 */

import { inject, injectable } from 'tsyringe';
import type { Feature, GitCheckpoint } from '../../../../domain/generated/output.js';
import { CheckpointRestoreRefusedError } from '../../../../domain/errors/git-checkpoint-errors.js';
import { isAgentRunExecuting } from '../../../../domain/shared/agent-run-status.js';
import { resolveCheckpointSelector } from '../../../../domain/shared/git-checkpoint.js';
import { normalizePath } from '../../../../domain/shared/normalize-path.js';
import type { IAgentRunRepository } from '../../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '../../../ports/output/services/git-checkpoint-service.interface.js';
import { CaptureFeatureCheckpointUseCase } from './capture-feature-checkpoint.use-case.js';
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

/**
 * Case-insensitive on purpose: on Windows `C:/Repo` and `c:/repo` are one
 * directory, and treating two spellings as the same can only make the guard
 * refuse more, never less.
 */
function samePath(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

@injectable()
export class RestoreFeatureCheckpointUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository,
    @inject('IGitCheckpointService') private readonly git: IGitCheckpointService,
    @inject('IAgentRunRepository') private readonly runs: IAgentRunRepository,
    @inject(CaptureFeatureCheckpointUseCase)
    private readonly capture: CaptureFeatureCheckpointUseCase
  ) {}

  async execute(input: RestoreFeatureCheckpointInput): Promise<RestoreFeatureCheckpointResult> {
    const feature = await findFeatureOrThrow(this.features, input.featureId);
    const target = resolveCheckpointSelector(
      await this.checkpoints.listByFeatureId(feature.id),
      input.step
    );
    const worktreePath = await this.assertRestorable(feature);

    const safety = await this.capture.capturePreRestore({ featureId: feature.id, worktreePath });
    await this.git.restoreWorktree(worktreePath, target.treeSha);
    return { restored: target, safety };
  }

  /** Returns the worktree path once every guard has passed. */
  private async assertRestorable(feature: Feature): Promise<string> {
    const worktreePath = feature.worktreePath;
    if (!worktreePath || samePath(worktreePath, feature.repositoryPath)) {
      throw new CheckpointRestoreRefusedError(
        'the feature has no worktree of its own, and the repository checkout is never restored.'
      );
    }

    let linked: boolean;
    try {
      linked = await this.git.isLinkedWorktree(worktreePath);
    } catch (err) {
      throw new CheckpointRestoreRefusedError(
        `the worktree at ${worktreePath} cannot be read (${err instanceof Error ? err.message : String(err)}).`
      );
    }
    if (!linked) {
      throw new CheckpointRestoreRefusedError(
        `${worktreePath} is not a linked worktree, so it may be someone's own checkout.`
      );
    }

    const run = await this.runs.findLatestByFeatureId(feature.id);
    if (run && isAgentRunExecuting(run.status)) {
      throw new CheckpointRestoreRefusedError(
        `an agent is ${run.status} on this feature. Stop it first ("shep feat stop"), then restore.`
      );
    }
    return worktreePath;
  }
}
