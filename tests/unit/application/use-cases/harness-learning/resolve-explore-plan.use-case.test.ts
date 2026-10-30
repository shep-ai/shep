import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ResolveExplorePlanUseCase } from '@/application/use-cases/harness-learning/resolve-explore-plan.use-case.js';
import { fakeSettingsRepository } from '../../../../helpers/harness-learning.fakes.js';
import { HarnessRecursion, LearningMode } from '@/domain/generated/output.js';

function plan(
  settings: Parameters<typeof fakeSettingsRepository>[0],
  feature: Record<string, unknown> | null
) {
  return new ResolveExplorePlanUseCase(fakeSettingsRepository(settings), {
    findById: vi.fn(async () => feature),
  } as never).execute('feat-1');
}

describe('ResolveExplorePlanUseCase', () => {
  it('never explores while the flag is off, even for a feature that asked', async () => {
    expect(await plan({ selfLearning: false }, { exploreHarness: true })).toBeNull();
  });

  it('does not explore in Reflect or Off mode unless the feature asked', async () => {
    expect(await plan({ learning: { mode: LearningMode.Reflect } }, { name: 'F' })).toBeNull();
    expect(await plan({}, { name: 'F' })).toBeNull();
  });

  it('explores a feature created with Explore on, with its own k', async () => {
    expect(await plan({}, { name: 'Audit log', exploreHarness: true, exploreK: 3 })).toEqual({
      k: 3,
      recursion: HarnessRecursion.Parallel,
      maxCostUsd: 20,
      alwaysOnCharCap: 4000,
      featureName: 'Audit log',
    });
  });

  it('explores every feature in Explore mode with the settings budget, clamped', async () => {
    const p = await plan(
      {
        learning: {
          mode: LearningMode.Explore,
          exploreK: 2,
          exploreRecursion: HarnessRecursion.Sequential,
        },
      },
      { name: 'F', exploreK: 99 }
    );
    expect(p).toMatchObject({ k: 5, recursion: HarnessRecursion.Sequential });
  });
});
