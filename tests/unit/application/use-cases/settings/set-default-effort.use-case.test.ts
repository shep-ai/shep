import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetDefaultEffortUseCase } from '@/application/use-cases/settings/set-default-effort.use-case.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { AgentEffort, type Settings } from '@/domain/generated/output.js';

describe('SetDefaultEffortUseCase', () => {
  let stored: Settings;
  let repository: ISettingsRepository;
  let useCase: SetDefaultEffortUseCase;

  beforeEach(() => {
    stored = createDefaultSettings();
    repository = {
      initialize: vi.fn(),
      load: vi.fn(async () => stored),
      update: vi.fn(async (s: Settings) => {
        stored = s;
      }),
    };
    useCase = new SetDefaultEffortUseCase(repository);
  });

  it('sets a valid level and persists it', async () => {
    const result = await useCase.execute({ effort: 'high' });

    expect(result.models.effort).toBe(AgentEffort.high);
    expect(repository.update).toHaveBeenCalledOnce();
    expect(stored.models.effort).toBe(AgentEffort.high);
  });

  it('normalizes case and whitespace', async () => {
    expect((await useCase.execute({ effort: ' XHIGH ' })).models.effort).toBe(AgentEffort.xhigh);
  });

  it.each([null, undefined, ''])('clears the effort for %s (agent default)', async (effort) => {
    stored.models.effort = AgentEffort.max;

    const result = await useCase.execute({ effort });

    expect('effort' in result.models).toBe(false);
    expect(repository.update).toHaveBeenCalledOnce();
  });

  it('rejects an unknown level without persisting anything', async () => {
    await expect(useCase.execute({ effort: 'ultra' })).rejects.toThrow(
      /low, medium, high, xhigh, max/
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('fails when settings have not been initialized', async () => {
    vi.mocked(repository.load).mockResolvedValue(null);

    await expect(useCase.execute({ effort: 'low' })).rejects.toThrow(/not initialized/i);
  });

  it('bumps updatedAt', async () => {
    const before = stored.updatedAt;
    const result = await useCase.execute({ effort: 'low' });
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });
});
