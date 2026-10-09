/**
 * Set Feature Flag Use Case (spec 133)
 *
 * Turns one feature flag on or off. The web feature-flags view, the Settings
 * page and `shep settings flags` all go through here, so an unknown flag is
 * rejected in one place and the other flags are never rebuilt.
 */

import { injectable, inject } from 'tsyringe';
import type { Settings } from '../../../domain/generated/output.js';
import { createDefaultSettings } from '../../../domain/factories/settings-defaults.factory.js';
import { isFeatureFlagKey } from '../../../domain/shared/feature-flag-catalog.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface SetFeatureFlagInput {
  /** A FeatureFlags key; anything else is rejected. */
  key: string;
  enabled: boolean;
}

@injectable()
export class SetFeatureFlagUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: SetFeatureFlagInput): Promise<Settings> {
    if (!isFeatureFlagKey(input.key)) {
      throw new Error(`Unknown feature flag "${input.key}"`);
    }
    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not initialized');
    }

    const next: Settings = {
      ...settings,
      featureFlags: {
        ...(settings.featureFlags ?? createDefaultSettings().featureFlags!),
        [input.key]: input.enabled,
      },
      updatedAt: new Date(),
    };
    await this.settingsRepository.update(next);
    return next;
  }
}
