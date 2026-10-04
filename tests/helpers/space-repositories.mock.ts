/**
 * Space and Project-Memory Repository Mocks (spec 120)
 *
 * One definition of each test double, so adding a port method is a one-line
 * change and the compiler still checks the double against the interface.
 * Defaults are the empty answers; `getDefault` returns the seeded default space.
 */

import { vi, type Mock } from 'vitest';
import type { IProjectMemoryRepository } from '@/application/ports/output/repositories/project-memory-repository.interface.js';
import type { ISpaceRepository } from '@/application/ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '@/application/ports/output/repositories/product-line-repository.interface.js';
import type { ISpaceMembershipRepository } from '@/application/ports/output/repositories/space-membership-repository.interface.js';
import type { Space } from '@/domain/generated/output.js';
import { DEFAULT_SPACE_ID } from '@/domain/shared/space-resolution.js';

export type MockProjectMemoryRepository = { [K in keyof IProjectMemoryRepository]: Mock };
export type MockSpaceRepository = { [K in keyof ISpaceRepository]: Mock };
export type MockProductLineRepository = { [K in keyof IProductLineRepository]: Mock };
export type MockSpaceMembershipRepository = { [K in keyof ISpaceMembershipRepository]: Mock };

export const DEFAULT_SPACE: Space = {
  id: DEFAULT_SPACE_ID,
  name: 'Default',
  slug: 'default',
  isDefault: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

export function createMockProjectMemoryRepository(
  overrides: Partial<MockProjectMemoryRepository> = {}
): MockProjectMemoryRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    listByRepository: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    listSpaceWide: vi.fn().mockResolvedValue([]),
    listProductLine: vi.fn().mockResolvedValue([]),
    countBySpace: vi.fn().mockResolvedValue(0),
    updateContent: vi.fn().mockResolvedValue(undefined),
    updateScope: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockSpaceRepository(
  overrides: Partial<MockSpaceRepository> = {}
): MockSpaceRepository {
  return {
    list: vi.fn().mockResolvedValue([DEFAULT_SPACE]),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    getDefault: vi.fn().mockResolvedValue(DEFAULT_SPACE),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    setDefault: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockProductLineRepository(
  overrides: Partial<MockProductLineRepository> = {}
): MockProductLineRepository {
  return {
    listAll: vi.fn().mockResolvedValue([]),
    listBySpace: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteBySpace: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockSpaceMembershipRepository(
  overrides: Partial<MockSpaceMembershipRepository> = {}
): MockSpaceMembershipRepository {
  return {
    listRules: vi.fn().mockResolvedValue([]),
    findRuleById: vi.fn().mockResolvedValue(null),
    createRule: vi.fn().mockResolvedValue(undefined),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    deleteRulesForSpace: vi.fn().mockResolvedValue(undefined),
    findAssignment: vi.fn().mockResolvedValue(null),
    listAssignments: vi.fn().mockResolvedValue([]),
    upsertAssignment: vi.fn().mockResolvedValue(undefined),
    deleteAssignment: vi.fn().mockResolvedValue(undefined),
    deleteAssignmentsForSpace: vi.fn().mockResolvedValue(undefined),
    clearProductLine: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
