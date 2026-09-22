/**
 * In-memory IAgentRunRepository fake that honours `allowedFrom`.
 *
 * Several processes write one run's status (the worker, Stop, Approve/Reject,
 * the crash sweep), and the guard that keeps them from clobbering each other
 * lives in the repository's WHERE clause. A `vi.fn()` that ignores the guard
 * and returns `undefined` makes every such test pass for the wrong reason, so
 * this fake applies the same rule as the SQL: the status check and the write
 * happen in one synchronous step (no `await` between them), and the result is
 * `true` only when the row changed.
 *
 * Every method is a vitest spy so tests can still assert on calls.
 */

import { vi, type Mock } from 'vitest';
import type {
  AgentRunListFilter,
  AgentRunStatusUpdateOptions,
  AgentRunStatusUpdates,
  IAgentRunRepository,
} from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { AgentRun, AgentRunStatus } from '@/domain/generated/output.js';

export type FakeAgentRunRepository = { [K in keyof IAgentRunRepository]: Mock } & {
  /** Direct read of the stored row, bypassing the spies. */
  peek(id: string): AgentRun | undefined;
  /** Seed or overwrite a row, bypassing the spies. */
  seed(run: AgentRun): void;
};

/** Compare instants the way the SQL does: as epoch milliseconds. */
function timestampOf(value: unknown): number {
  return value instanceof Date ? value.getTime() : new Date(value as string | number).getTime();
}

export function createFakeAgentRunRepository(initial: AgentRun[] = []): FakeAgentRunRepository {
  const rows = new Map<string, AgentRun>();
  for (const run of initial) rows.set(run.id, { ...run });

  const updateStatus = (
    id: string,
    status: AgentRunStatus,
    updates?: AgentRunStatusUpdates,
    options?: AgentRunStatusUpdateOptions
  ): boolean => {
    const existing = rows.get(id);
    if (!existing) return false;
    const allowedFrom = options?.allowedFrom;
    if (
      allowedFrom !== undefined &&
      allowedFrom.length > 0 &&
      !allowedFrom.includes(existing.status)
    ) {
      return false;
    }
    const expected = options?.expectedUpdatedAt;
    if (expected !== undefined && timestampOf(existing.updatedAt) !== timestampOf(expected)) {
      return false;
    }
    const defined = Object.fromEntries(
      Object.entries(updates ?? {}).filter(([, value]) => value !== undefined)
    );
    // `pid: null` clears the column, as the SQL does; the entity then has no pid.
    const { pid, ...rest } = defined as AgentRunStatusUpdates;
    const next: AgentRun = { ...existing, ...(rest as Partial<AgentRun>), status };
    if (pid === null) delete next.pid;
    else if (pid !== undefined) next.pid = pid;
    rows.set(id, next);
    return true;
  };

  return {
    create: vi.fn(async (run: AgentRun) => {
      rows.set(run.id, { ...run });
    }),
    findById: vi.fn(async (id: string) => {
      const run = rows.get(id);
      return run ? { ...run } : null;
    }),
    findByIds: vi.fn(async (ids: readonly string[]) =>
      ids.flatMap((id) => {
        const run = rows.get(id);
        return run ? [{ ...run }] : [];
      })
    ),
    findByThreadId: vi.fn(
      async (threadId: string) => [...rows.values()].find((r) => r.threadId === threadId) ?? null
    ),
    findLatestByFeatureId: vi.fn(async () => null),
    updateStatus: vi.fn(
      async (
        id: string,
        status: AgentRunStatus,
        updates?: AgentRunStatusUpdates,
        options?: AgentRunStatusUpdateOptions
      ) => updateStatus(id, status, updates, options)
    ),
    updatePinnedConfig: vi.fn(async () => undefined),
    findRunningByPid: vi.fn(async () => []),
    list: vi.fn(async (filter?: AgentRunListFilter) =>
      [...rows.values()]
        .filter((r) => filter?.statuses === undefined || filter.statuses.includes(r.status))
        .map((r) => ({ ...r }))
    ),
    delete: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
    peek: (id: string) => rows.get(id),
    seed: (run: AgentRun) => {
      rows.set(run.id, { ...run });
    },
  };
}

/** Every IAgentRunRepository method as a vitest mock. */
export type MockAgentRunRepository = { [K in keyof IAgentRunRepository]: Mock };

/**
 * Plain spy double for tests that script each answer themselves.
 *
 * `updateStatus` defaults to `true` (the write applied) because callers now
 * gate on it: a guarded claim that "lost" would otherwise be the silent
 * default of every hand-built `vi.fn()`. Tests that exercise the race use
 * {@link createFakeAgentRunRepository} instead.
 */
export function createMockAgentRunRepository(
  overrides: Partial<MockAgentRunRepository> = {}
): MockAgentRunRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByIds: vi.fn().mockResolvedValue([]),
    findByThreadId: vi.fn().mockResolvedValue(null),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(true),
    updatePinnedConfig: vi.fn().mockResolvedValue(undefined),
    findRunningByPid: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
