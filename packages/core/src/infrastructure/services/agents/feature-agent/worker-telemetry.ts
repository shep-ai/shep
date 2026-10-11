/**
 * feature.run.finished for the feature-agent worker (spec 133).
 *
 * Called right after the worker's guarded terminal-status write succeeds, so
 * each outcome the worker owns is recorded once. Carries the status, the agent
 * type and a duration bucket — never the prompt, result or error text.
 */

import { TelemetryEvent } from '../../../../domain/generated/output.js';
import type { AgentRunStatus, AgentType } from '../../../../domain/generated/output.js';
import type { ITelemetry } from '../../../../application/ports/output/services/telemetry.interface.js';
import { toDurationBucket } from '../../../../domain/shared/telemetry/telemetry-delivery.js';

export type RunFinishedRecorder = (status: AgentRunStatus) => void;

export function createRunFinishedRecorder(
  telemetry: ITelemetry,
  agentType: AgentType,
  startedAt: Date,
  now: () => Date = () => new Date()
): RunFinishedRecorder {
  return (status) => {
    try {
      telemetry.record(TelemetryEvent.FeatureRunFinished, {
        status,
        agentType,
        duration: toDurationBucket(now().getTime() - startedAt.getTime()),
      });
    } catch {
      // Telemetry must never affect the run's outcome.
    }
  };
}
