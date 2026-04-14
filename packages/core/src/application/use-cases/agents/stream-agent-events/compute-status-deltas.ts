/**
 * Pure helper: compute AgentRun status transition events.
 *
 * Handles both:
 * - Normal status deltas (running → completed, etc.) using the STATUS_TO_EVENT
 *   table.
 * - Crash detection: the run claims to be active but its owning process is
 *   gone. The caller passes in an `isProcessAlive` predicate so this module
 *   stays free of infrastructure concerns.
 *
 * Mutates `prev` in place to record the newly-observed status/crash flag.
 */

import type { AgentRun, Feature } from '../../../../domain/generated/output.js';
import {
  AgentRunStatus,
  NotificationEventType,
  NotificationSeverity,
} from '../../../../domain/generated/output.js';

import type { CachedFeatureState, StreamedAgentEvent } from './stream-agent-events.types.js';
import { STATUS_TO_EVENT, resultToPhase } from './stream-agent-events.types.js';

export interface ComputeStatusDeltasArgs {
  feature: Feature;
  run: AgentRun;
  prev: CachedFeatureState;
  isProcessAlive: (pid: number) => boolean;
}

export function computeStatusDeltas(args: ComputeStatusDeltasArgs): StreamedAgentEvent[] {
  const { feature, run, prev, isProcessAlive } = args;
  const events: StreamedAgentEvent[] = [];

  // Status change.
  if (prev.status !== run.status) {
    prev.status = run.status;
    const mapping = STATUS_TO_EVENT[run.status];
    if (mapping) {
      const phase = resultToPhase(run.result);
      events.push({
        kind: 'notification',
        event: {
          eventType: mapping.eventType,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          ...(phase && { phaseName: phase }),
          message: `Agent status: ${run.status}`,
          severity: mapping.severity,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // Crash detection — status still active but owning process is gone.
  const isActive = run.status === AgentRunStatus.running || run.status === AgentRunStatus.pending;
  if (isActive && run.pid && !prev.crashEmitted && !isProcessAlive(run.pid)) {
    prev.crashEmitted = true;
    const phase = resultToPhase(run.result);
    events.push({
      kind: 'notification',
      event: {
        eventType: NotificationEventType.AgentFailed,
        agentRunId: run.id,
        featureId: feature.id,
        featureName: feature.name,
        ...(phase && { phaseName: phase }),
        message: `Agent crashed (PID ${run.pid} dead)`,
        severity: NotificationSeverity.Error,
        timestamp: new Date().toISOString(),
      },
    });
  }

  return events;
}
