/**
 * Get Telemetry Status Use Case (spec 133)
 *
 * What `shep telemetry status` and the Settings section show: whether
 * telemetry is on and why not, the user's preferences, how many events wait,
 * and where they would go.
 */

import { injectable, inject } from 'tsyringe';
import type { TelemetryDisabledReason } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { ITelemetryOutboxRepository } from '../../ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { ITelemetryTransport } from '../../ports/output/services/telemetry-transport.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import { resolveTelemetryState } from '../../../domain/shared/telemetry/telemetry-state.js';

export interface TelemetryStatus {
  enabled: boolean;
  reason: TelemetryDisabledReason | null;
  includeIdentity: boolean;
  contactConsent: boolean;
  installId: string | null;
  queuedEvents: number;
  /** False until a project key is configured; nothing is sent before then. */
  configured: boolean;
  destination: string;
}

@injectable()
export class GetTelemetryStatusUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('ITelemetryOutboxRepository')
    private readonly outbox: ITelemetryOutboxRepository,
    @inject('ITelemetryTransport')
    private readonly transport: ITelemetryTransport,
    @inject('ITelemetryRuntime')
    private readonly runtime: ITelemetryRuntime
  ) {}

  async execute(): Promise<TelemetryStatus> {
    const telemetry = (await this.settingsRepository.load())?.telemetry;
    const state = resolveTelemetryState(this.runtime.env(), telemetry);
    return {
      enabled: state.enabled,
      reason: state.reason,
      includeIdentity: telemetry?.includeIdentity ?? true,
      contactConsent: telemetry?.contactConsent ?? false,
      installId: telemetry?.installId ?? null,
      queuedEvents: this.outbox.count(),
      configured: this.transport.isConfigured(),
      destination: this.transport.destination(),
    };
  }
}
