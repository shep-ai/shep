/**
 * ResolveExplorePlanUseCase (spec 150) — whether this feature's implement
 * step runs in Explore mode, and with which budget. Opt-in twice: the
 * selfLearning flag must be on, and either the feature was created with
 * Explore on or the learning mode is Explore. The feature's own k wins.
 */

import { inject, injectable } from 'tsyringe';
import { LearningMode, type HarnessRecursion } from '../../../domain/generated/output.js';
import { resolveLearningConfig } from '../../../domain/harness-learning/learning-config.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface ExplorePlan {
  k: number;
  recursion: HarnessRecursion;
  maxCostUsd: number;
  alwaysOnCharCap: number;
  featureName: string;
}

@injectable()
export class ResolveExplorePlanUseCase {
  constructor(
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('IFeatureRepository') private readonly features: IFeatureRepository
  ) {}

  async execute(featureId: string): Promise<ExplorePlan | null> {
    const settings = await this.settings.load();
    if (settings?.featureFlags?.selfLearning !== true) return null;
    const feature = await this.features.findById(featureId);
    const config = resolveLearningConfig(settings.learning);
    const wanted = feature?.exploreHarness === true || config.mode === LearningMode.Explore;
    if (!wanted) return null;
    const k = resolveLearningConfig({
      ...config,
      exploreK: feature?.exploreK ?? config.exploreK,
    }).exploreK;
    return {
      k,
      recursion: config.exploreRecursion,
      maxCostUsd: config.exploreMaxCostUsd,
      alwaysOnCharCap: config.alwaysOnCharCap,
      featureName: feature?.name ?? featureId,
    };
  }
}
