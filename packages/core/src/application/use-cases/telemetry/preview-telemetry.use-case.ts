/**
 * Preview Telemetry Use Case (spec 133)
 *
 * Powers `shep telemetry show`: the request body the daemon would post for
 * the events queued right now, built by the same envelope builder and
 * transport as a real send, with the project key replaced by a placeholder.
 */

import { injectable, inject } from 'tsyringe';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { ITelemetryOutboxRepository } from '../../ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { ITelemetryTransport } from '../../ports/output/services/telemetry-transport.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import { resolveTelemetryState } from '../../../domain/shared/telemetry/telemetry-state.js';
import { TELEMETRY_BATCH_SIZE } from '../../../domain/shared/telemetry/telemetry-delivery.js';
import { TelemetryEnvelopeBuilder } from './telemetry-envelope-builder.js';

export interface TelemetryPreview {
  enabled: boolean;
  configured: boolean;
  destination: string;
  queuedEvents: number;
  /** Wire body for the next batch (at most one batch of events). */
  body: unknown;
}

@injectable()
export class PreviewTelemetryUseCase {
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
    private readonly runtime: ITelemetryRuntime
  ) {}

  async execute(): Promise<TelemetryPreview> {
    const settings = await this.settingsRepository.load();
    if (!settings) throw new Error('Settings not initialized');
    const entries = this.outbox.list(TELEMETRY_BATCH_SIZE);
    return {
      enabled: resolveTelemetryState(this.runtime.env(), settings.telemetry).enabled,
      configured: this.transport.isConfigured(),
      destination: this.transport.destination(),
      queuedEvents: this.outbox.count(),
      body: this.transport.describe(await this.envelopes.build(entries, settings)),
    };
  }
}
