/**
 * Capture Feature Checkpoint Use Case (spec 135)
 *
 * Snapshots a feature's worktree into `refs/shep/checkpoints/<featureId>/<seq>-<node>`
 * and records it. A snapshot whose tree equals the latest checkpoint's is not
 * recorded: the step changed nothing.
 *
 * - `ensureBaseline` — the "before" of the first step; only when none exist.
 * - `captureStep` — after a feature-agent graph node.
 * - `capturePreRestore` — just before a restore, so the restore can be undone.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import { GitCheckpointKind, type GitCheckpoint } from '../../../../domain/generated/output.js';
import {
  BASELINE_CHECKPOINT_NODE,
  PRE_RESTORE_CHECKPOINT_NODE,
  assertCheckpointNodeName,
  buildCheckpointRef,
  checkpointLabel,
  latestCheckpoint,
} from '../../../../domain/shared/git-checkpoint.js';
import type { IGitCheckpointRepository } from '../../../ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '../../../ports/output/services/git-checkpoint-service.interface.js';
import type { IClock } from '../../../ports/output/services/clock.interface.js';

export interface CheckpointTarget {
  featureId: string;
  /** Directory whose content is snapshotted — the feature's worktree. */
  worktreePath: string;
  agentRunId?: string;
}

export interface CaptureStepInput extends CheckpointTarget {
  /** Graph node that just ran. */
  node: string;
}

/** The baseline is always 0; steps start at 1 even when no baseline exists. */
const BASELINE_SEQUENCE = 0;
const FIRST_STEP_SEQUENCE = 1;

const NO_CHANGE = { filesChanged: 0, additions: 0, deletions: 0 };

@injectable()
export class CaptureFeatureCheckpointUseCase {
  constructor(
    @inject('IGitCheckpointService') private readonly git: IGitCheckpointService,
    @inject('IGitCheckpointRepository') private readonly checkpoints: IGitCheckpointRepository,
    @inject('IClock') private readonly clock: IClock
  ) {}

  async ensureBaseline(target: CheckpointTarget): Promise<GitCheckpoint | null> {
    const existing = await this.checkpoints.listByFeatureId(target.featureId);
    if (existing.length > 0) return null;
    return this.capture(target, GitCheckpointKind.Baseline, BASELINE_CHECKPOINT_NODE, undefined);
  }

  async captureStep(input: CaptureStepInput): Promise<GitCheckpoint | null> {
    assertCheckpointNodeName(input.node);
    const latest = latestCheckpoint(await this.checkpoints.listByFeatureId(input.featureId));
    return this.capture(input, GitCheckpointKind.Step, input.node, latest);
  }

  async capturePreRestore(target: CheckpointTarget): Promise<GitCheckpoint | null> {
    const latest = latestCheckpoint(await this.checkpoints.listByFeatureId(target.featureId));
    return this.capture(target, GitCheckpointKind.PreRestore, PRE_RESTORE_CHECKPOINT_NODE, latest);
  }

  private async capture(
    target: CheckpointTarget,
    kind: GitCheckpointKind,
    node: string,
    latest: GitCheckpoint | undefined
  ): Promise<GitCheckpoint | null> {
    const { featureId, worktreePath, agentRunId } = target;
    const snapshot = await this.git.snapshotWorktree(worktreePath);
    if (latest && latest.treeSha === snapshot.treeSha) return null;

    const sequence =
      kind === GitCheckpointKind.Baseline
        ? BASELINE_SEQUENCE
        : latest
          ? latest.sequence + 1
          : FIRST_STEP_SEQUENCE;
    const ref = buildCheckpointRef(featureId, sequence, node);
    const stats =
      kind === GitCheckpointKind.Baseline
        ? NO_CHANGE
        : await this.git.diffStat(worktreePath, latest?.treeSha, snapshot.treeSha);
    const commitSha = await this.git.commitCheckpoint({
      cwd: worktreePath,
      treeSha: snapshot.treeSha,
      headSha: snapshot.headSha,
      ref,
      message: `shep checkpoint ${checkpointLabel({ sequence, node })}`,
    });

    const now = this.clock.now();
    const checkpoint: GitCheckpoint = {
      id: randomUUID(),
      featureId,
      ...(agentRunId ? { agentRunId } : {}),
      sequence,
      kind,
      node,
      ref,
      commitSha,
      treeSha: snapshot.treeSha,
      ...(snapshot.headSha ? { headSha: snapshot.headSha } : {}),
      ...stats,
      createdAt: now,
      updatedAt: now,
    };
    await this.checkpoints.create(checkpoint);
    return checkpoint;
  }
}
