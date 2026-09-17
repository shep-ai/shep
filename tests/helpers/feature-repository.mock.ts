/**
 * Feature Repository Mock
 *
 * One definition of the IFeatureRepository test double.
 *
 * Every use-case test used to declare its own `{ create: vi.fn(), findById:
 * vi.fn(), ... }` literal, so adding a single method to the port broke fifteen
 * files at once and each had to be patched by hand. With the shape defined here,
 * a new port method is a one-line change and the compiler still enforces that
 * the double satisfies the interface.
 *
 * Defaults are the empty answers: no feature found, nothing listed, nothing
 * running, nothing queued. Tests override what they care about with
 * `repo.findById.mockResolvedValue(...)` exactly as before, or by passing
 * overrides.
 */

import { vi, type Mock } from 'vitest';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';

/** Every IFeatureRepository method as a vitest mock, so tests can assert on calls. */
export type MockFeatureRepository = {
  [K in keyof IFeatureRepository]: Mock;
};

export function createMockFeatureRepository(
  overrides: Partial<MockFeatureRepository> = {}
): MockFeatureRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByIdPrefix: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByBranch: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    findByParentId: vi.fn().mockResolvedValue([]),
    countByLifecycles: vi.fn().mockResolvedValue(0),
    listQueued: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
