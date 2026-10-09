/**
 * Set Telemetry Preferences Use Case (spec 133)
 *
 * Changes the telemetry, identity and contact-consent preferences. Turning
 * telemetry off also deletes every queued event, so nothing recorded before
 * the opt-out is ever sent. Returns the updated settings so presentation can
 * refresh its in-process copy.
 */

import { injectable, inject } from 'tsyringe';
import type { Settings } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { telemetryConfigOf } from '../../../domain/shared/telemetry/telemetry-state.js';
import type { ITelemetryOutboxRepository } from '../../ports/output/repositories/telemetry-outbox.repository.interface.js';

export interface TelemetryPreferencesInput {
  enabled?: boolean;
  includeIdentity?: boolean;
  contactConsent?: boolean;
}

@injectable()
export class SetTelemetryPreferencesUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('ITelemetryOutboxRepository')
    private readonly outbox: ITelemetryOutboxRepository
  ) {}

  async execute(input: TelemetryPreferencesInput): Promise<Settings> {
    const current = await this.settingsRepository.load();
    if (!current) throw new Error('Settings not initialized');

    const previous = telemetryConfigOf(current);
    const updated: Settings = {
      ...current,
      telemetry: {
        ...previous,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.includeIdentity !== undefined ? { includeIdentity: input.includeIdentity } : {}),
        ...(input.contactConsent !== undefined ? { contactConsent: input.contactConsent } : {}),
      },
      updatedAt: new Date(),
    };
    await this.settingsRepository.update(updated);
    if (input.enabled === false) this.outbox.clear();
    return updated;
  }
}
