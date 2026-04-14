import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CheckOnboardingStatusUseCase } from '@/application/use-cases/settings/check-onboarding-status.use-case.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { Settings } from '@/domain/generated/output.js';

function makeSettingsRepo(
  load: ISettingsRepository['load'] = vi.fn().mockResolvedValue(null)
): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load,
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CheckOnboardingStatusUseCase', () => {
  let useCase: CheckOnboardingStatusUseCase;
  let repo: ISettingsRepository;

  beforeEach(() => {
    repo = makeSettingsRepo();
    useCase = new CheckOnboardingStatusUseCase(repo);
  });

  it('should return { isComplete: true } when onboardingComplete is true', async () => {
    repo = makeSettingsRepo(
      vi.fn().mockResolvedValue({ onboardingComplete: true } as unknown as Settings)
    );
    useCase = new CheckOnboardingStatusUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual({ isComplete: true });
  });

  it('should return { isComplete: false } when onboardingComplete is false', async () => {
    repo = makeSettingsRepo(
      vi.fn().mockResolvedValue({ onboardingComplete: false } as unknown as Settings)
    );
    useCase = new CheckOnboardingStatusUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual({ isComplete: false });
  });

  it('should return { isComplete: false } when the repository returns null', async () => {
    repo = makeSettingsRepo(vi.fn().mockResolvedValue(null));
    useCase = new CheckOnboardingStatusUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual({ isComplete: false });
  });
});
