/**
 * Outbox-backed telemetry (spec 133).
 *
 * The production ITelemetry in every process: checks the enabled state, then
 * writes the event to the local SQLite outbox for the daemon to send. It reads
 * the process's own settings copy; an opt-out made in another process is
 * enforced by the daemon's flush, which re-reads the database and clears the
 * outbox instead of sending.
 */

import type { TelemetryEvent } from '../../../domain/generated/output.js';
import type { ITelemetryOutboxRepository } from '../../../application/ports/output/repositories/telemetry-outbox.repository.interface.js';
import type {
  ITelemetry,
  TelemetryRecordOptions,
} from '../../../application/ports/output/services/telemetry.interface.js';
import type { TelemetryEventPropertyMap } from '../../../application/ports/output/services/telemetry-events.js';
import type { ITelemetryRuntime } from '../../../application/ports/output/services/telemetry-runtime.interface.js';
import type { ISettingsProvider } from '../../../application/ports/output/services/settings-provider.interface.js';
import type { IClock } from '../../../application/ports/output/services/clock.interface.js';
import { resolveTelemetryState } from '../../../domain/shared/telemetry/telemetry-state.js';
import { TELEMETRY_OUTBOX_CAP } from '../../../domain/shared/telemetry/telemetry-delivery.js';

export class OutboxTelemetry implements ITelemetry {
  constructor(
    private readonly outbox: ITelemetryOutboxRepository,
    private readonly settings: ISettingsProvider,
    private readonly runtime: ITelemetryRuntime,
    private readonly clock: IClock
  ) {}

  record<E extends TelemetryEvent>(
    event: E,
    properties: TelemetryEventPropertyMap[E],
    options?: TelemetryRecordOptions
  ): void {
    try {
      if (!this.settings.has()) return;
      const state = resolveTelemetryState(this.runtime.env(), this.settings.get().telemetry);
      if (!state.enabled) return;

      this.outbox.enqueue(
        {
          id: this.runtime.randomUuid(),
          event,
          properties: { ...properties, process: this.runtime.processKind() },
          capturedAt: this.clock.now(),
        },
        {
          cap: TELEMETRY_OUTBOX_CAP,
          ...(options?.onceKey ? { onceKeyHash: this.runtime.sha256(options.onceKey) } : {}),
        }
      );
    } catch {
      // Telemetry must never break the command, request or run that emits it.
    }
  }
}
