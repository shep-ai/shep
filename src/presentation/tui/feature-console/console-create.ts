/**
 * Creating a feature from the console (spec 150, task-28).
 *
 * The console creates through CreateFeatureUseCase with the user's workflow
 * defaults, exactly as `shep feat new` with no flags does. While the
 * selfLearning flag is on the form offers Explore for this one feature, with
 * its rollout budget k starting at the user's Self-learning setting.
 */

import type { TFunction } from 'i18next';
import type { LearningConfig } from '@/domain/generated/output.js';
import { resolveLearningConfig } from '@/domain/harness-learning/learning-config.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { FeatureConsoleActionResult } from '@/application/use-cases/feature-console/feature-console.types.js';
import { NS } from './console-labels.js';

/** What the console's create form produces. */
export interface ConsoleNewFeature {
  repositoryPath: string;
  userInput: string;
  /** Run the implement step in Explore mode for this feature (spec 150). */
  exploreHarness?: boolean;
  /** Explore rollout budget, 1..MAX_EXPLORE_K; only with exploreHarness. */
  exploreK?: number;
}

/** Present only while the selfLearning flag is on: the form then offers Explore. */
export interface ConsoleExplore {
  /** k the form starts at: the user's Self-learning setting. */
  defaultK: number;
}

export type CreateConsoleFeature = (
  input: ConsoleNewFeature
) => Promise<FeatureConsoleActionResult>;

/** The Explore offer for this console, from the flag and the stored learning settings. */
export function consoleExplore(
  selfLearningOn: boolean,
  learning: Partial<LearningConfig> | undefined
): ConsoleExplore | undefined {
  return selfLearningOn ? { defaultK: resolveLearningConfig(learning).exploreK } : undefined;
}

/** The console's create dependency, carried out by CreateFeatureUseCase. */
export function createFeatureDep(
  useCase: Pick<CreateFeatureUseCase, 'execute'>,
  t: TFunction
): CreateConsoleFeature {
  return async (input) => {
    try {
      const { feature, queued, queuePosition } = await useCase.execute({
        ...input,
        // Whatever the form leaves unset comes from Settings → Workflow (LESSONS.md).
        useWorkflowDefaults: true,
      });
      return {
        ok: true,
        message: queued
          ? t(`${NS}.create.queued`, { name: feature.name, position: queuePosition })
          : t(`${NS}.create.created`, { name: feature.name }),
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  };
}
