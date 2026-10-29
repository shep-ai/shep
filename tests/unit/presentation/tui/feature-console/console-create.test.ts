/**
 * Console create wiring (spec 150, task-28)
 *
 * The console's create flow goes through CreateFeatureUseCase with the user's
 * workflow defaults, as `shep feat new` does (LESSONS: a new entry point must
 * apply the same defaults), and passes the per-feature Explore choice through.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';

import { initI18n } from '@/presentation/tui/i18n.js';
import {
  consoleExplore,
  createFeatureDep,
} from '@/presentation/tui/feature-console/console-create.js';
import { MAX_EXPLORE_K } from '@/domain/harness-learning/learning-config.js';
import type { Feature } from '@/domain/generated/output.js';

const feature = { id: 'f-1', name: 'Dark mode' } as Feature;

describe('createFeatureDep', () => {
  let t: TFunction;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  it('creates with the workflow defaults and the Explore choice', async () => {
    const execute = vi.fn(async () => ({ feature, queued: false }));
    const result = await createFeatureDep(
      { execute },
      t
    )({
      repositoryPath: '/work/acme-web',
      userInput: 'Add dark mode',
      exploreHarness: true,
      exploreK: 3,
    });

    expect(execute).toHaveBeenCalledWith({
      repositoryPath: '/work/acme-web',
      userInput: 'Add dark mode',
      useWorkflowDefaults: true,
      exploreHarness: true,
      exploreK: 3,
    });
    expect(result).toEqual({ ok: true, message: 'Created Dark mode' });
  });

  it('says when the feature waits for a free slot', async () => {
    const execute = vi.fn(async () => ({ feature, queued: true, queuePosition: 2 }));
    const result = await createFeatureDep(
      { execute },
      t
    )({
      repositoryPath: '/r',
      userInput: 'x',
    });

    expect(execute).toHaveBeenCalledWith({
      repositoryPath: '/r',
      userInput: 'x',
      useWorkflowDefaults: true,
    });
    expect(result.message).toBe('Created Dark mode — queued at position 2');
  });

  it('turns a failure into a result', async () => {
    const execute = vi.fn(async () => {
      throw new Error('Not a git repository');
    });

    expect(
      await createFeatureDep({ execute }, t)({ repositoryPath: '/r', userInput: 'x' })
    ).toEqual({ ok: false, message: 'Not a git repository' });
  });
});

describe('consoleExplore', () => {
  it('is undefined while the selfLearning flag is off', () => {
    expect(consoleExplore(false, { exploreK: 3 })).toBeUndefined();
  });

  it("starts k at the user's setting, within the valid range", () => {
    expect(consoleExplore(true, { exploreK: 3 })).toEqual({ defaultK: 3 });
    expect(consoleExplore(true, undefined)).toEqual({ defaultK: 1 });
    expect(consoleExplore(true, { exploreK: 99 })).toEqual({ defaultK: MAX_EXPLORE_K });
  });
});
