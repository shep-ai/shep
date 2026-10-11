/**
 * List Feature Flags Use Case (spec 135)
 *
 * Every feature flag with its group, one-line description, current value and
 * default — what the feature-flags view and `shep settings flags` show.
 */

import { injectable, inject } from 'tsyringe';
import type { FeatureFlagGroup } from '../../../domain/generated/output.js';
import { createDefaultSettings } from '../../../domain/factories/settings-defaults.factory.js';
import {
  listFeatureFlagDescriptors,
  type FeatureFlagKey,
} from '../../../domain/shared/feature-flag-catalog.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface FeatureFlagState {
  key: FeatureFlagKey;
  group: FeatureFlagGroup;
  description: string;
  enabled: boolean;
  /** The value a fresh install starts with. */
  defaultEnabled: boolean;
}

@injectable()
export class ListFeatureFlagsUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(): Promise<FeatureFlagState[]> {
    const defaults = createDefaultSettings().featureFlags!;
    const current = (await this.settingsRepository.load())?.featureFlags ?? defaults;
    return listFeatureFlagDescriptors().map((descriptor) => ({
      ...descriptor,
      enabled: current[descriptor.key] ?? defaults[descriptor.key],
      defaultEnabled: defaults[descriptor.key],
    }));
  }
}
