/**
 * The worker's CheckpointRecorder (spec 135).
 *
 * Bridges graph-node events to CaptureFeatureCheckpointUseCase, so the graph
 * factories stay free of DI. Every failure becomes a log line: a missing git,
 * a locked index or a full disk must never fail a feature run.
 */

import type { CaptureFeatureCheckpointUseCase } from '../../../../application/use-cases/features/checkpoints/capture-feature-checkpoint.use-case.js';
import { checkpointLabel } from '../../../../domain/shared/git-checkpoint.js';
import type { CheckpointRecorder } from './nodes/with-checkpoint.js';
import type { FeatureAgentState } from './state.js';

export interface CheckpointRecorderDeps {
  capture: Pick<CaptureFeatureCheckpointUseCase, 'ensureBaseline' | 'captureStep'>;
  agentRunId?: string;
  log: (message: string) => void;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createCheckpointRecorder(deps: CheckpointRecorderDeps): CheckpointRecorder {
  const target = (state: FeatureAgentState) => ({
    featureId: state.featureId,
    worktreePath: state.worktreePath || state.repositoryPath,
    ...(deps.agentRunId ? { agentRunId: deps.agentRunId } : {}),
  });

  return {
    async beforeNode(state) {
      try {
        const baseline = await deps.capture.ensureBaseline(target(state));
        if (baseline) deps.log(`[checkpoint] recorded ${checkpointLabel(baseline)}`);
      } catch (err) {
        deps.log(`[checkpoint] baseline skipped: ${describeError(err)}`);
      }
    },
    async afterNode(node, state) {
      try {
        const checkpoint = await deps.capture.captureStep({ ...target(state), node });
        if (checkpoint) deps.log(`[checkpoint] recorded ${checkpointLabel(checkpoint)}`);
      } catch (err) {
        deps.log(`[checkpoint] ${node} skipped: ${describeError(err)}`);
      }
    },
  };
}
