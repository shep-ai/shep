/**
 * Transport that never sends (spec 133). For tests and for builds that must
 * not contact the network.
 */

import type {
  ITelemetryTransport,
  TelemetryEnvelope,
} from '../../../application/ports/output/services/telemetry-transport.interface.js';

const NOWHERE = 'none';

export class NoopTelemetryTransport implements ITelemetryTransport {
  isConfigured(): boolean {
    return false;
  }

  destination(): string {
    return NOWHERE;
  }

  describe(envelopes: readonly TelemetryEnvelope[]): unknown {
    return { batch: envelopes };
  }

  async send(): Promise<void> {
    // Intentionally empty.
  }
}
