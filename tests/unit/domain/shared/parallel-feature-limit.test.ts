/**
 * Tests for the parallel-feature capacity rule.
 *
 * This module is the single definition of "does a feature occupy a slot",
 * "what does 0 mean", and "what is a valid limit". Six surfaces read it, so the
 * membership assertions below are exhaustive over SdlcLifecycle on purpose: a
 * new lifecycle value must force a decision here rather than silently defaulting
 * to "not running".
 */

import { describe, it, expect } from 'vitest';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import {
  UNLIMITED_PARALLEL_FEATURES,
  MAX_PARALLEL_FEATURES_LIMIT,
  RUNNING_LIFECYCLES,
  isRunningLifecycle,
  hasCapacity,
  clampMaxParallelFeatures,
  resolveMaxParallelFeatures,
  isQueuedForCapacity,
  markQueuedForCapacity,
  isFleetQueuePaused,
  resolveFleetQueuePause,
} from '@/domain/shared/parallel-feature-limit.js';
import type { Feature } from '@/domain/generated/output.js';

const RUNNING: SdlcLifecycle[] = [
  SdlcLifecycle.Started,
  SdlcLifecycle.Analyze,
  SdlcLifecycle.Requirements,
  SdlcLifecycle.Research,
  SdlcLifecycle.Planning,
  SdlcLifecycle.Implementation,
  SdlcLifecycle.Exploring,
];

const NOT_RUNNING: SdlcLifecycle[] = [
  SdlcLifecycle.Pending,
  SdlcLifecycle.Blocked,
  SdlcLifecycle.Review,
  SdlcLifecycle.AwaitingUpstream,
  SdlcLifecycle.Maintain,
  SdlcLifecycle.Deleting,
  SdlcLifecycle.Archived,
];

describe('parallel-feature-limit', () => {
  describe('RUNNING_LIFECYCLES', () => {
    it.each(RUNNING)('treats %s as occupying a slot', (lifecycle) => {
      expect(isRunningLifecycle(lifecycle)).toBe(true);
      expect(RUNNING_LIFECYCLES.has(lifecycle)).toBe(true);
    });

    it.each(NOT_RUNNING)('treats %s as not occupying a slot', (lifecycle) => {
      expect(isRunningLifecycle(lifecycle)).toBe(false);
      expect(RUNNING_LIFECYCLES.has(lifecycle)).toBe(false);
    });

    it('covers every lifecycle value exactly once across the two sets', () => {
      const all = Object.values(SdlcLifecycle);
      expect(new Set([...RUNNING, ...NOT_RUNNING])).toEqual(new Set(all));
      expect(RUNNING.length + NOT_RUNNING.length).toBe(all.length);
    });
  });

  describe('hasCapacity', () => {
    it('always has capacity when the limit is unlimited', () => {
      expect(hasCapacity(0, UNLIMITED_PARALLEL_FEATURES)).toBe(true);
      expect(hasCapacity(1_000, UNLIMITED_PARALLEL_FEATURES)).toBe(true);
    });

    it('has capacity while running is below the limit', () => {
      expect(hasCapacity(0, 3)).toBe(true);
      expect(hasCapacity(2, 3)).toBe(true);
    });

    it('has no capacity once running reaches the limit', () => {
      expect(hasCapacity(3, 3)).toBe(false);
    });

    it('has no capacity when running exceeds a lowered limit', () => {
      expect(hasCapacity(5, 3)).toBe(false);
    });
  });

  describe('clampMaxParallelFeatures', () => {
    it('passes through valid limits', () => {
      expect(clampMaxParallelFeatures(0)).toBe(0);
      expect(clampMaxParallelFeatures(1)).toBe(1);
      expect(clampMaxParallelFeatures(MAX_PARALLEL_FEATURES_LIMIT)).toBe(
        MAX_PARALLEL_FEATURES_LIMIT
      );
    });

    it('floors negatives to unlimited rather than inverting the rule', () => {
      expect(clampMaxParallelFeatures(-1)).toBe(UNLIMITED_PARALLEL_FEATURES);
      expect(clampMaxParallelFeatures(-999)).toBe(UNLIMITED_PARALLEL_FEATURES);
    });

    it('caps absurd values at the documented maximum', () => {
      expect(clampMaxParallelFeatures(MAX_PARALLEL_FEATURES_LIMIT + 1)).toBe(
        MAX_PARALLEL_FEATURES_LIMIT
      );
    });

    it('treats unparseable input as unlimited instead of writing NaN', () => {
      expect(clampMaxParallelFeatures(Number.NaN)).toBe(UNLIMITED_PARALLEL_FEATURES);
      expect(clampMaxParallelFeatures(Number.POSITIVE_INFINITY)).toBe(MAX_PARALLEL_FEATURES_LIMIT);
      expect(clampMaxParallelFeatures(undefined)).toBe(UNLIMITED_PARALLEL_FEATURES);
    });

    it('truncates fractional input', () => {
      expect(clampMaxParallelFeatures(2.9)).toBe(2);
    });
  });

  describe('resolveMaxParallelFeatures', () => {
    it('reads the configured limit from workflow settings', () => {
      expect(resolveMaxParallelFeatures({ workflow: { maxParallelFeatures: 4 } })).toBe(4);
    });

    it('falls back to unlimited when settings are absent or unset', () => {
      expect(resolveMaxParallelFeatures(undefined)).toBe(UNLIMITED_PARALLEL_FEATURES);
      expect(resolveMaxParallelFeatures(null)).toBe(UNLIMITED_PARALLEL_FEATURES);
      expect(resolveMaxParallelFeatures({})).toBe(UNLIMITED_PARALLEL_FEATURES);
      expect(resolveMaxParallelFeatures({ workflow: {} })).toBe(UNLIMITED_PARALLEL_FEATURES);
    });

    it('clamps a corrupt persisted value', () => {
      expect(resolveMaxParallelFeatures({ workflow: { maxParallelFeatures: -5 } })).toBe(
        UNLIMITED_PARALLEL_FEATURES
      );
    });
  });

  describe('fleet queue pause', () => {
    const paused = {
      workflow: {
        maxParallelFeatures: 4,
        queuePaused: { pausedAt: '2026-03-01T12:00:00Z', reason: 'Circuit breaker tripped' },
      },
    };

    it('reports a queue paused only when a pause record is present', () => {
      expect(isFleetQueuePaused(paused)).toBe(true);
      expect(isFleetQueuePaused({ workflow: { maxParallelFeatures: 4 } })).toBe(false);
      expect(isFleetQueuePaused(undefined)).toBe(false);
      expect(isFleetQueuePaused(null)).toBe(false);
    });

    it('surfaces the recorded reason and timestamp', () => {
      expect(resolveFleetQueuePause(paused)).toEqual({
        pausedAt: '2026-03-01T12:00:00Z',
        reason: 'Circuit breaker tripped',
      });
      expect(resolveFleetQueuePause({ workflow: {} })).toBeUndefined();
    });

    // The whole reason the pause is a separate record: 0 already means
    // UNLIMITED, so writing the pause as `maxParallelFeatures = 0` would remove
    // the cap and admit everything — the exact opposite of pausing.
    it('admits nothing while paused, even with a generous configured limit', () => {
      expect(resolveMaxParallelFeatures(paused)).toBe(0);
    });

    it('admits nothing while paused when no ceiling was ever configured', () => {
      const unlimitedButPaused = {
        workflow: { queuePaused: { pausedAt: '2026-03-01T12:00:00Z', reason: 'tripped' } },
      };

      expect(resolveMaxParallelFeatures(unlimitedButPaused)).toBe(0);
      // ...and the pause, not the absent ceiling, is what closed admission.
      expect(isFleetQueuePaused(unlimitedButPaused)).toBe(true);
    });

    it('is not fooled by a pause record that is explicitly undefined', () => {
      expect(resolveMaxParallelFeatures({ workflow: { queuePaused: undefined } })).toBe(
        UNLIMITED_PARALLEL_FEATURES
      );
    });

    it('keeps the pause distinguishable from "unlimited", which is also 0', () => {
      // A paused queue and an uncapped one both resolve to 0, so the number
      // alone cannot tell them apart — `hasCapacity(0, 0)` is TRUE. That is why
      // the gate (`FeatureCapacityService.hasCapacity`/`claimSlot`) consults
      // `isFleetQueuePaused` rather than testing the limit, and why this pair of
      // assertions is the contract: pause wins, and it is still visible.
      expect(resolveMaxParallelFeatures(paused)).toBe(UNLIMITED_PARALLEL_FEATURES);
      expect(isFleetQueuePaused(paused)).toBe(true);
      expect(isFleetQueuePaused({ workflow: { maxParallelFeatures: 0 } })).toBe(false);
    });
  });

  describe('queue marker', () => {
    const feature = (overrides?: Partial<Feature>) =>
      ({ id: 'f1', lifecycle: SdlcLifecycle.Requirements, ...overrides }) as Feature;

    it('is not queued without a queuedAt timestamp', () => {
      expect(isQueuedForCapacity(feature())).toBe(false);
      expect(isQueuedForCapacity(feature({ lifecycle: SdlcLifecycle.Pending }))).toBe(false);
    });

    it('is queued when a queuedAt timestamp is present', () => {
      expect(isQueuedForCapacity(feature({ queuedAt: new Date() }))).toBe(true);
    });

    it('distinguishes a capacity-queued feature from a user-deferred one', () => {
      // Both sit in Pending; only the stamped one may be started automatically.
      const deferred = feature({ lifecycle: SdlcLifecycle.Pending });
      const queued = markQueuedForCapacity(feature());

      expect(queued.lifecycle).toBe(SdlcLifecycle.Pending);
      expect(deferred.lifecycle).toBe(SdlcLifecycle.Pending);
      expect(isQueuedForCapacity(queued)).toBe(true);
      expect(isQueuedForCapacity(deferred)).toBe(false);
    });

    it('stamps the supplied moment on both queuedAt and updatedAt', () => {
      const now = new Date('2026-03-01T12:00:00Z');

      const queued = markQueuedForCapacity(feature(), now);

      expect(queued.queuedAt).toBe(now);
      expect(queued.updatedAt).toBe(now);
    });

    it('does not mutate the input feature', () => {
      const original = feature();

      markQueuedForCapacity(original, new Date());

      expect(original.queuedAt).toBeUndefined();
      expect(original.lifecycle).toBe(SdlcLifecycle.Requirements);
    });
  });
});
