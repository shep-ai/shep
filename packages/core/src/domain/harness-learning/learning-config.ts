/**
 * Self-learning harness settings: defaults and normalisation (spec 150).
 *
 * `Settings.learning` is optional and may be partial or hand-edited. Every
 * reader goes through `resolveLearningConfig`, so the opt-in defaults (mode
 * Off, Manual adoption) and the valid ranges live in one place.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import {
  HarnessAdoptionPolicy,
  HarnessRecursion,
  LearningMode,
  type LearningConfig,
} from '../generated/output';

/** Smallest and largest task-level recursion budget accepted (4k executions). */
export const MIN_EXPLORE_K = 1;
export const MAX_EXPLORE_K = 5;

/** A per-feature or settings k every surface accepts: a whole number in range. */
export function isValidExploreK(k: number): boolean {
  return Number.isInteger(k) && k >= MIN_EXPLORE_K && k <= MAX_EXPLORE_K;
}

/** Always-on text below this cannot hold a single skill trigger line plus a rule. */
export const MIN_ALWAYS_ON_CHAR_CAP = 500;

export const DEFAULT_LEARNING_CONFIG: Readonly<LearningConfig> = Object.freeze({
  mode: LearningMode.Off,
  exploreK: 1,
  exploreRecursion: HarnessRecursion.Parallel,
  exploreMaxCostUsd: 20,
  adoptionPolicy: HarnessAdoptionPolicy.Manual,
  alwaysOnCharCap: 4000,
  regressionMinSample: 5,
});

function oneOf<T extends string>(values: Record<string, T>, value: unknown, fallback: T): T {
  return (Object.values(values) as unknown[]).includes(value) ? (value as T) : fallback;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveLearningConfig(stored: Partial<LearningConfig> | undefined): LearningConfig {
  const d = DEFAULT_LEARNING_CONFIG;
  const s = stored ?? {};
  const k = Math.round(positive(s.exploreK, d.exploreK));
  return {
    mode: oneOf(LearningMode, s.mode, d.mode),
    exploreK: Math.min(Math.max(k, MIN_EXPLORE_K), MAX_EXPLORE_K),
    exploreRecursion: oneOf(HarnessRecursion, s.exploreRecursion, d.exploreRecursion),
    exploreMaxCostUsd: positive(s.exploreMaxCostUsd, d.exploreMaxCostUsd),
    adoptionPolicy: oneOf(HarnessAdoptionPolicy, s.adoptionPolicy, d.adoptionPolicy),
    alwaysOnCharCap: Math.max(
      Math.round(positive(s.alwaysOnCharCap, d.alwaysOnCharCap)),
      MIN_ALWAYS_ON_CHAR_CAP
    ),
    regressionMinSample: Math.round(positive(s.regressionMinSample, d.regressionMinSample)),
  };
}
