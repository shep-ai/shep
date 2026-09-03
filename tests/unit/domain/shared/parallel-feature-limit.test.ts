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
