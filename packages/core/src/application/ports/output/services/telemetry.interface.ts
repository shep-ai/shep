/**
 * Telemetry Port (spec 133)
 *
 * Records a usage event for later delivery. Every process (CLI, daemon,
 * feature-agent workers) records through this port; only the daemon sends.
 *
 * Contract:
 * - `record` never throws and never blocks on the network. Telemetry must not
 *   be able to break the command, request or run that emits it.
 * - It is synchronous so it can run inside a crash handler right before
 *   `process.exit`.
 * - When telemetry is off (user opt-out, CI, DO_NOT_TRACK,
 *   SHEP_TELEMETRY_DISABLED, tests) nothing is stored.
 */

import type { TelemetryEvent } from '../../../../domain/generated/output.js';
import type { TelemetryEventPropertyMap } from './telemetry-events.js';

export interface TelemetryRecordOptions {
  /**
   * Record this event at most once per key across every process, e.g.
   * `pr.merged:<featureId>` when several detectors can observe one merge. The
   * key is hashed before it is stored and never sent.
   */
  onceKey?: string;
}

export interface ITelemetry {
  record<E extends TelemetryEvent>(
    event: E,
    properties: TelemetryEventPropertyMap[E],
    options?: TelemetryRecordOptions
  ): void;
}
