/** Telemetry that records nothing (spec 133). For tests. */

import type { TelemetryEvent } from '../../../domain/generated/output.js';
import type {
  ITelemetry,
  TelemetryRecordOptions,
} from '../../../application/ports/output/services/telemetry.interface.js';
import type { TelemetryEventPropertyMap } from '../../../application/ports/output/services/telemetry-events.js';

export class NoopTelemetry implements ITelemetry {
  record<E extends TelemetryEvent>(
    _event: E,
    _properties: TelemetryEventPropertyMap[E],
    _options?: TelemetryRecordOptions
  ): void {
    // Intentionally empty.
  }
}
