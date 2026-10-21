/**
 * Application Repository Mock
 *
 * One definition of the IApplicationRepository test double, so a new port
 * method is a one-line change here instead of a hand patch in every test that
 * declares its own `{ create: vi.fn(), findById: vi.fn(), ... }` literal. The
 * mapped type keeps the compiler enforcing that the double covers the port.
 *
 * Defaults are the empty answers: nothing found, nothing listed. The guarded
 * status write defaults to winning its claim; a test that cares about losing a
 * race overrides it.
 */

import { vi, type Mock } from 'vitest';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';

/** Every IApplicationRepository method as a vitest mock, so tests can assert on calls. */
export type MockApplicationRepository = {
  [K in keyof IApplicationRepository]: Mock;
};

export function createMockApplicationRepository(
  overrides: Partial<MockApplicationRepository> = {}
): MockApplicationRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(true),
    softDelete: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
