/**
 * Update Settings Use Case
 *
 * Updates existing settings in the database.
 * Validates input and persists changes.
 *
 * Business Rules:
 * - Settings must exist before updating
 * - All fields are updatable
 * - Returns updated settings after persistence
 * - Raising (or clearing) the parallel-feature limit admits queued features
 */

import { injectable, inject } from 'tsyringe';
import type { Settings } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { AdmitQueuedFeaturesUseCase } from '../features/capacity/admit-queued-features.use-case.js';

/**
 * Use case for updating existing settings.
 *
 * Algorithm:
 * 1. Receive updated settings
 * 2. Persist to repository
 * 3. Drain the capacity queue — raising the limit is one of the few things that
 *    frees a slot without any feature changing lifecycle, so nothing else would
 *    notice
 * 4. Return updated settings
 */
@injectable()
export class UpdateSettingsUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject(AdmitQueuedFeaturesUseCase)
    private readonly admitQueued: AdmitQueuedFeaturesUseCase
  ) {}

  /**
   * Execute the update settings use case.
   *
   * @param settings - The updated settings to persist
   * @returns The updated Settings
   */
  async execute(settings: Settings): Promise<Settings> {
    // Persist updated settings
    await this.settingsRepository.update(settings);

    // Admit whatever the new limit now has room for. Isolated: a failed drain
    // must not make a successful settings save look like it failed. The
    // dashboard sweep retries.
    try {
      await this.admitQueued.execute();
    } catch {
      // Intentionally ignored — see above.
    }

    // Return the updated settings
    return settings;
  }
}
