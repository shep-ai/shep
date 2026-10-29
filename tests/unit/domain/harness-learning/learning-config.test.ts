import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEARNING_CONFIG,
  MAX_EXPLORE_K,
  MIN_ALWAYS_ON_CHAR_CAP,
  resolveLearningConfig,
} from '@/domain/harness-learning/learning-config.js';
import {
  HarnessAdoptionPolicy,
  HarnessRecursion,
  LearningMode,
} from '@/domain/generated/output.js';

describe('resolveLearningConfig', () => {
  it('is opt-in by default: mode Off and Manual adoption', () => {
    const config = resolveLearningConfig(undefined);
    expect(config.mode).toBe(LearningMode.Off);
    expect(config.adoptionPolicy).toBe(HarnessAdoptionPolicy.Manual);
    expect(config).toEqual(DEFAULT_LEARNING_CONFIG);
  });

  it('keeps every stored value that is valid', () => {
    const config = resolveLearningConfig({
      mode: LearningMode.Explore,
      exploreK: 3,
      exploreRecursion: HarnessRecursion.Sequential,
      exploreMaxCostUsd: 50,
      adoptionPolicy: HarnessAdoptionPolicy.AutoTextOnly,
      alwaysOnCharCap: 6000,
      regressionMinSample: 8,
    });
    expect(config).toEqual({
      mode: LearningMode.Explore,
      exploreK: 3,
      exploreRecursion: HarnessRecursion.Sequential,
      exploreMaxCostUsd: 50,
      adoptionPolicy: HarnessAdoptionPolicy.AutoTextOnly,
      alwaysOnCharCap: 6000,
      regressionMinSample: 8,
    });
  });

  it('fills a partial row from the defaults', () => {
    const config = resolveLearningConfig({ mode: LearningMode.Reflect });
    expect(config.mode).toBe(LearningMode.Reflect);
    expect(config.exploreK).toBe(DEFAULT_LEARNING_CONFIG.exploreK);
  });

  it('clamps k into 1..MAX_EXPLORE_K and rounds it', () => {
    expect(resolveLearningConfig({ exploreK: 0 }).exploreK).toBe(1);
    expect(resolveLearningConfig({ exploreK: 2.6 }).exploreK).toBe(3);
    expect(resolveLearningConfig({ exploreK: 99 }).exploreK).toBe(MAX_EXPLORE_K);
  });

  it('replaces non-positive or non-finite numbers with defaults', () => {
    const config = resolveLearningConfig({
      exploreMaxCostUsd: -1,
      regressionMinSample: Number.NaN,
    });
    expect(config.exploreMaxCostUsd).toBe(DEFAULT_LEARNING_CONFIG.exploreMaxCostUsd);
    expect(config.regressionMinSample).toBe(DEFAULT_LEARNING_CONFIG.regressionMinSample);
  });

  it('never lets the always-on cap fall below the minimum', () => {
    expect(resolveLearningConfig({ alwaysOnCharCap: 10 }).alwaysOnCharCap).toBe(
      MIN_ALWAYS_ON_CHAR_CAP
    );
  });

  it('ignores enum values it does not know', () => {
    const config = resolveLearningConfig({
      mode: 'turbo' as LearningMode,
      adoptionPolicy: 'yolo' as HarnessAdoptionPolicy,
      exploreRecursion: 'sideways' as HarnessRecursion,
    });
    expect(config.mode).toBe(LearningMode.Off);
    expect(config.adoptionPolicy).toBe(HarnessAdoptionPolicy.Manual);
    expect(config.exploreRecursion).toBe(HarnessRecursion.Parallel);
  });
});
