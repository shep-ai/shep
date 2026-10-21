/**
 * Interactive Session Repository Mock
 *
 * One definition of the IInteractiveSessionRepository test double, typed so
 * the compiler still checks it against the port: a new port method is a
 * one-line change here, not a hunt through every test file (see LESSONS.md,
 * "A port method addition should be a one-line change").
 *
 * Defaults are the empty answers: nothing found, nothing active, no agent
 * session id, no usage. Tests override what they care about with
 * `repo.findById.mockResolvedValue(...)` or by passing overrides.
 */

import { vi, type Mock } from 'vitest';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';

/** Every IInteractiveSessionRepository method as a vitest mock. */
export type MockInteractiveSessionRepository = {
  [K in keyof IInteractiveSessionRepository]: Mock;
};

export function createMockInteractiveSessionRepository(
  overrides: Partial<MockInteractiveSessionRepository> = {}
): MockInteractiveSessionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByFeatureId: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    markStoppedIfActive: vi.fn().mockResolvedValue(false),
    updateLastActivity: vi.fn().mockResolvedValue(undefined),
    markAllActiveStopped: vi.fn().mockResolvedValue(undefined),
    countActiveSessions: vi.fn().mockResolvedValue(0),
    updateAgentSessionId: vi.fn().mockResolvedValue(undefined),
    getAgentSessionId: vi.fn().mockResolvedValue(null),
    findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    clearAgentSessionIdsForFeature: vi.fn().mockResolvedValue(undefined),
    updateTurnStatus: vi.fn().mockResolvedValue(undefined),
    getTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    getAllActiveTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    accumulateUsage: vi.fn().mockResolvedValue(undefined),
    getUsage: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}
