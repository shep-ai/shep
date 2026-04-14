/**
 * Check Onboarding Status Use Case
 *
 * Loads settings via the injected ISettingsRepository and returns whether
 * first-run onboarding has been completed.
 */

import { injectable, inject } from 'tsyringe';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

/**
 * Use case for checking whether onboarding is complete.
 * Reads the Settings record from the repository so callers do not
 * depend on the in-memory singleton from the infrastructure layer.
 */
@injectable()
export class CheckOnboardingStatusUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(): Promise<{ isComplete: boolean }> {
    const settings = await this.settingsRepository.load();
    return { isComplete: settings?.onboardingComplete ?? false };
  }
}
