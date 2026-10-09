import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListFeatureFlagsUseCase } from '@/application/use-cases/settings/list-feature-flags.use-case.js';
import { SetFeatureFlagUseCase } from '@/application/use-cases/settings/set-feature-flag.use-case.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { FeatureFlagGroup, type Settings } from '@/domain/generated/output.js';

describe('feature flag use cases (spec 135)', () => {
  let stored: Settings | null;
  let repository: ISettingsRepository;

  beforeEach(() => {
    stored = createDefaultSettings();
    repository = {
      initialize: vi.fn(),
      load: vi.fn(async () => stored),
      update: vi.fn(async (s: Settings) => {
        stored = s;
      }),
    };
  });

  describe('ListFeatureFlagsUseCase', () => {
    it('lists every flag with its group, description, value and default', async () => {
      stored!.featureFlags = { ...stored!.featureFlags!, spaces: false, aspm: true };

      const flags = await new ListFeatureFlagsUseCase(repository).execute();

      expect(flags.map((f) => f.key)).toHaveLength(
        Object.keys(createDefaultSettings().featureFlags!).length
      );
      expect(flags.find((f) => f.key === 'spaces')).toEqual({
        key: 'spaces',
        group: FeatureFlagGroup.SoftwareFactory,
        description: expect.stringMatching(/\S/),
        enabled: false,
        defaultEnabled: true,
      });
      expect(flags.find((f) => f.key === 'aspm')).toMatchObject({
        enabled: true,
        defaultEnabled: false,
      });
    });

    it('falls back to the defaults for flags a stored row does not carry', async () => {
      stored = { ...stored!, featureFlags: undefined };

      const flags = await new ListFeatureFlagsUseCase(repository).execute();

      for (const flag of flags) expect(flag.enabled, flag.key).toBe(flag.defaultEnabled);
    });
  });

  describe('SetFeatureFlagUseCase', () => {
    it('turns one flag on or off and leaves the others alone', async () => {
      const before = { ...stored!.featureFlags! };

      const result = await new SetFeatureFlagUseCase(repository).execute({
        key: 'factory',
        enabled: false,
      });

      expect(result.featureFlags).toEqual({ ...before, factory: false });
      expect(repository.update).toHaveBeenCalledOnce();
      expect(stored!.featureFlags?.factory).toBe(false);
    });

    it('rejects an unknown flag without persisting anything', async () => {
      await expect(
        new SetFeatureFlagUseCase(repository).execute({ key: 'supplyChainSecurity', enabled: true })
      ).rejects.toThrow(/Unknown feature flag "supplyChainSecurity"/);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('fails when settings have not been initialized', async () => {
      stored = null;

      await expect(
        new SetFeatureFlagUseCase(repository).execute({ key: 'spaces', enabled: true })
      ).rejects.toThrow(/not initialized/i);
    });
  });
});
