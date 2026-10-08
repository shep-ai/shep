/**
 * Feature Capacity Service Mock
 *
 * One definition of the FeatureCapacityService test double.
 *
 * Four suites had each inlined `{ hasCapacity: vi.fn(), getQueuePosition:
 * vi.fn() }`, so adding `claimSlot` to the service broke all four at once with
 * `this.capacity.claimSlot is not a function` — a runtime failure typecheck
 * could not catch, because every one of them was cast with `as any`. With the
 * shape defined here a new method is a one-line change and the compiler still
 * enforces that the double satisfies the service.
 *
 * Defaults describe an idle machine with room to spare: no cap reached, every
 * claim won, nothing queued. A test that cares about losing a race overrides
 * `claimSlot`.
 */

import { vi, type Mock } from 'vitest';
import type { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import { UNLIMITED_PARALLEL_FEATURES } from '@/domain/shared/parallel-feature-limit.js';

/** Every public FeatureCapacityService method as a vitest mock. */
export type MockFeatureCapacityService = {
  [K in keyof FeatureCapacityService]: Mock;
};

export function createMockFeatureCapacityService(
  overrides: Partial<MockFeatureCapacityService> = {}
): MockFeatureCapacityService {
  return {
    getLimit: vi.fn().mockResolvedValue(UNLIMITED_PARALLEL_FEATURES),
    getConfiguredLimit: vi.fn().mockResolvedValue(UNLIMITED_PARALLEL_FEATURES),
    isPaused: vi.fn().mockResolvedValue(false),
    getRunningCount: vi.fn().mockResolvedValue(0),
    hasCapacity: vi.fn().mockResolvedValue(true),
    claimSlot: vi.fn().mockResolvedValue(true),
    snapshot: vi.fn().mockResolvedValue({
      limit: UNLIMITED_PARALLEL_FEATURES,
      unlimited: true,
      paused: false,
      running: 0,
      available: null,
      queue: [],
    }),
    getQueuePosition: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
