/**
 * Checkpoint Restore Policy (spec 138)
 *
 * Decides whether a feature's worktree may be restored to a checkpoint. Used
 * by RestoreFeatureCheckpointUseCase (to refuse) and by
 * ListFeatureCheckpointsUseCase (so every surface can say why before the user
 * asks). Three independent conditions, because the one thing a restore must
 * never do is write to the user's own checkout:
 *
 * 1. the feature has a worktree path, and it is not the repository path;
 * 2. git itself reports that directory as a linked worktree;
 * 3. the feature's latest agent run is not pending or running.
 */

import { inject, injectable } from 'tsyringe';
import { CheckpointRestoreBlocker, type Feature } from '../../../../domain/generated/output.js';
import { isAgentRunExecuting } from '../../../../domain/shared/agent-run-status.js';
import { normalizePath } from '../../../../domain/shared/normalize-path.js';
import type { IAgentRunRepository } from '../../../ports/output/agents/agent-run-repository.interface.js';
import type { IGitCheckpointService } from '../../../ports/output/services/git-checkpoint-service.interface.js';

export type RestoreEligibility =
  | { allowed: true; worktreePath: string }
  | { allowed: false; blocker: CheckpointRestoreBlocker; detail: string };

/**
 * Case-insensitive on purpose: on Windows `C:/Repo` and `c:/repo` are one
 * directory, and treating two spellings as the same can only make the guard
 * refuse more, never less.
 */
function samePath(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

function blocked(blocker: CheckpointRestoreBlocker, detail: string): RestoreEligibility {
  return { allowed: false, blocker, detail };
}

@injectable()
export class CheckpointRestorePolicy {
  constructor(
    @inject('IGitCheckpointService') private readonly git: IGitCheckpointService,
    @inject('IAgentRunRepository') private readonly runs: IAgentRunRepository
  ) {}

  async evaluate(feature: Feature): Promise<RestoreEligibility> {
    const worktreePath = feature.worktreePath;
    if (!worktreePath || samePath(worktreePath, feature.repositoryPath)) {
      return blocked(
        CheckpointRestoreBlocker.NoOwnWorktree,
        'the feature has no worktree of its own, and the repository checkout is never restored.'
      );
    }

    let linked: boolean;
    try {
      linked = await this.git.isLinkedWorktree(worktreePath);
    } catch (err) {
      return blocked(
        CheckpointRestoreBlocker.WorktreeUnavailable,
        `the worktree at ${worktreePath} cannot be read (${err instanceof Error ? err.message : String(err)}).`
      );
    }
    if (!linked) {
      return blocked(
        CheckpointRestoreBlocker.NotLinkedWorktree,
        `${worktreePath} is not a linked worktree, so it may be someone's own checkout.`
      );
    }

    const run = await this.runs.findLatestByFeatureId(feature.id);
    if (run && isAgentRunExecuting(run.status)) {
      return blocked(
        CheckpointRestoreBlocker.AgentRunning,
        `an agent is ${run.status} on this feature. Stop it first, then restore.`
      );
    }
    return { allowed: true, worktreePath };
  }
}
