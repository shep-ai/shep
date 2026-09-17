/**
 * Parallel-Feature Capacity Rule
 *
 * The single place that decides how many features may run at once. Every
 * surface that reads `settings.workflow.maxParallelFeatures` — the admission
 * check, the queue drain, the SQLite mapper, the web settings input, the CLI
 * settings command, the TUI — goes through these helpers, so "0 means
 * unlimited", "which lifecycles occupy a slot", and "what is a valid limit"
 * have exactly one definition.
 *
 * Note the import convention: relative imports inside `domain/` carry no file
 * extension, because the web package consumes this directory as raw TypeScript
 * source and its bundler cannot resolve a `.js` specifier pointing at a `.ts`
 * file.
 */

import { SdlcLifecycle } from '../generated/output';
import type { Feature } from '../generated/output';

/**
 * The limit value that disables the cap entirely.
 *
 * This is the default. A feature that predates the setting must behave exactly
 * as it did before it existed, and "off" needs to be expressible without a
 * second boolean.
 */
export const UNLIMITED_PARALLEL_FEATURES = 0;

/**
 * Highest limit a user may configure.
 *
 * Not a technical ceiling — an upper bound that keeps a typo (or a stray paste)
 * from writing a number so large the cap is effectively off while still
 * *looking* set.
 */
export const MAX_PARALLEL_FEATURES_LIMIT = 64;

/**
 * Lifecycles that mean an agent is actively working on the feature, and so the
 * feature is occupying one of the configured slots.
 *
 * Deliberately excludes every state where the feature is waiting on something
 * other than an agent: `Pending` and `Blocked` have not started, `Review` and
 * `AwaitingUpstream` are waiting on a human or on CI, and `Maintain`,
 * `Deleting` and `Archived` are finished. Holding a slot open for a PR awaiting
 * review would make the cap mean "features in flight" rather than "agents
 * running", which is not the resource anyone is short of.
 */
export const RUNNING_LIFECYCLES: ReadonlySet<SdlcLifecycle> = new Set<SdlcLifecycle>([
  SdlcLifecycle.Started,
  SdlcLifecycle.Analyze,
  SdlcLifecycle.Requirements,
  SdlcLifecycle.Research,
  SdlcLifecycle.Planning,
  SdlcLifecycle.Implementation,
  SdlcLifecycle.Exploring,
]);

/** Does a feature in this lifecycle occupy one of the parallel slots? */
export function isRunningLifecycle(lifecycle: SdlcLifecycle): boolean {
  return RUNNING_LIFECYCLES.has(lifecycle);
}

/**
 * Is there room to start one more feature?
 *
 * Derived from the current count rather than a decrementing counter on purpose:
 * a crashed, force-deleted or externally-mutated feature would leak a slot from
 * a counter forever, whereas a count recomputed from lifecycle is self-healing.
 */
export function hasCapacity(runningCount: number, limit: number): boolean {
  if (limit === UNLIMITED_PARALLEL_FEATURES) return true;
  return runningCount < limit;
}

/**
 * Coerce any input — user typing, a corrupt DB value, a parsed query param —
 * into a limit that is safe to store and to compare against.
 *
 * Negatives and unparseable values collapse to unlimited rather than to `1`:
 * the failure mode of "cap accidentally off" is a busy machine, while the
 * failure mode of "cap accidentally 1" is a queue that never visibly drains and
 * looks like Shep has hung.
 */
export function clampMaxParallelFeatures(value: number | undefined | null): number {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return UNLIMITED_PARALLEL_FEATURES;
  }
  if (value >= MAX_PARALLEL_FEATURES_LIMIT) return MAX_PARALLEL_FEATURES_LIMIT;
  const truncated = Math.trunc(value);
  if (truncated <= UNLIMITED_PARALLEL_FEATURES) return UNLIMITED_PARALLEL_FEATURES;
  return truncated;
}

/**
 * Is this feature waiting for a capacity slot?
 *
 * The marker is the timestamp, never the lifecycle. A feature the user deferred
 * with `--pending` and a feature the cap is holding back sit in the SAME
 * lifecycle, and only one of them may be started automatically — so every
 * surface that asks "is this queued" must ask about `queuedAt`.
 */
export function isQueuedForCapacity(feature: Pick<Feature, 'queuedAt'>): boolean {
  return feature.queuedAt !== undefined && feature.queuedAt !== null;
}

/**
 * The queued form of a feature: parked in Pending, stamped with the moment the
 * user asked for it to run.
 *
 * `queuedAt` is the FIFO key, so stamping it at the moment of the *request* is
 * what makes a feature queued later by pressing Start fall in behind features
 * that were queued earlier.
 */
export function markQueuedForCapacity<T extends Feature>(feature: T, now: Date = new Date()): T {
  return {
    ...feature,
    lifecycle: SdlcLifecycle.Pending,
    queuedAt: now,
    updatedAt: now,
  };
}

/** Minimal shape this rule needs from settings — keeps callers free of the full entity. */
export interface MaxParallelFeaturesSource {
  workflow?: { maxParallelFeatures?: number };
}

/**
 * The effective limit for the given settings, clamped.
 *
 * Accepts `undefined`/`null` so callers that may run before settings are
 * initialised do not have to branch — an uninitialised install is unlimited,
 * which is also its default once written.
 */
export function resolveMaxParallelFeatures(
  settings: MaxParallelFeaturesSource | undefined | null
): number {
  return clampMaxParallelFeatures(settings?.workflow?.maxParallelFeatures);
}
