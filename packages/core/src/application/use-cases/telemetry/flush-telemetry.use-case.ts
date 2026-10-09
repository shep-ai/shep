/**
 * Flush Telemetry Use Case (spec 133)
 *
 * Runs in the long-lived server processes (the daemon, or `shep ui`), never in
 * a CLI invocation or worker. Sends due outbox entries in batches through the
 * transport and owns the delivery rules:
 * - re-reads the opt-out state from the database first, so an opt-out made in
 *   any process takes effect here: when off, the outbox is cleared, not sent;
 * - with no project key configured nothing is sent and entries wait (capped);
 * - a failed batch backs off with jitter and is dropped on its fifth failure;
 * - a batch is claimed with a lease, so two server processes never send the
 *   same events, and a sender that dies mid-send releases them on expiry;
 * - each event keeps its uuid across retries, so the backend can tell a
 *   retried copy from a new event.
 */

import { injectable, inject } from 'tsyringe';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { ITelemetryOutboxRepository } from '../../ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { ITelemetryTransport } from '../../ports/output/services/telemetry-transport.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import { resolveTelemetryState } from '../../../domain/shared/telemetry/telemetry-state.js';
import {
  TELEMETRY_BATCH_SIZE,
  TELEMETRY_MAX_SEND_ATTEMPTS,
  TELEMETRY_SEND_LEASE_MS,
  telemetryRetryDelayMs,
} from '../../../domain/shared/telemetry/telemetry-delivery.js';
import { TelemetryEnvelopeBuilder } from './telemetry-envelope-builder.js';

/** Upper bound on batches per flush, so one tick cannot run unbounded. */
const MAX_BATCHES_PER_FLUSH = 25;

export type TelemetryFlushSkip = 'disabled' | 'unconfigured';

export interface TelemetryFlushResult {
  sent: number;
  /** Events in a batch that failed and will be retried. */
  failed: number;
  /** Events dropped after their last allowed attempt. */
  dropped: number;
  /** Why nothing was attempted, or null. */
  skipped: TelemetryFlushSkip | null;
}

@injectable()
export class FlushTelemetryUseCase {
  constructor(
    @inject('ITelemetryOutboxRepository')
    private readonly outbox: ITelemetryOutboxRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('ITelemetryTransport')
    private readonly transport: ITelemetryTransport,
    @inject(TelemetryEnvelopeBuilder)
    private readonly envelopes: TelemetryEnvelopeBuilder,
    @inject('ITelemetryRuntime')
    private readonly runtime: ITelemetryRuntime,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(): Promise<TelemetryFlushResult> {
    const result: TelemetryFlushResult = { sent: 0, failed: 0, dropped: 0, skipped: null };
    const settings = await this.settingsRepository.load();
    if (!settings || !resolveTelemetryState(this.runtime.env(), settings.telemetry).enabled) {
      this.outbox.clear();
      return { ...result, skipped: 'disabled' };
    }
    if (!this.transport.isConfigured()) return { ...result, skipped: 'unconfigured' };

    for (let batchNumber = 0; batchNumber < MAX_BATCHES_PER_FLUSH; batchNumber++) {
      const now = this.clock.now();
      const leaseUntil = new Date(now.getTime() + TELEMETRY_SEND_LEASE_MS);
      const batch = this.outbox.claimDue(now, TELEMETRY_BATCH_SIZE, leaseUntil);
      if (batch.length === 0) break;
      const ids = batch.map((entry) => entry.id);

      try {
        await this.transport.send(await this.envelopes.build(batch, settings));
        this.outbox.remove(ids);
        result.sent += batch.length;
      } catch {
        const attempts = Math.max(...batch.map((entry) => entry.attempts)) + 1;
        if (attempts >= TELEMETRY_MAX_SEND_ATTEMPTS) {
          this.outbox.remove(ids);
          result.dropped += batch.length;
        } else {
          const delay = telemetryRetryDelayMs(attempts, this.runtime.random());
          this.outbox.recordFailure(ids, new Date(now.getTime() + delay));
          result.failed += batch.length;
        }
        break;
      }
    }
    return result;
  }
}
