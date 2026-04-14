/**
 * Pure helper: compute `PhaseCompleted` events from phase timing rows.
 *
 * Timing rows only appear after a phase finishes, so any row with a
 * `completedAt` that isn't already in the cached set means we just finished
 * that phase. Mutates `prev.completedPhases` in place.
 */

import type { AgentRun, Feature, PhaseTiming } from '../../../../domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
} from '../../../../domain/generated/output.js';

import type { CachedFeatureState, StreamedAgentEvent } from './stream-agent-events.types.js';

export interface ComputePhaseCompletionDeltasArgs {
  feature: Feature;
  run: AgentRun;
  prev: CachedFeatureState;
  timings: PhaseTiming[];
}

export function computePhaseCompletionDeltas(
  args: ComputePhaseCompletionDeltasArgs
): StreamedAgentEvent[] {
  const { feature, run, prev, timings } = args;
  const events: StreamedAgentEvent[] = [];

  for (const t of timings) {
    if (t.completedAt && !prev.completedPhases.has(t.phase)) {
      prev.completedPhases.add(t.phase);
      events.push({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.PhaseCompleted,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          phaseName: t.phase,
          message: `Completed ${t.phase} phase`,
          severity: NotificationSeverity.Info,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  return events;
}
