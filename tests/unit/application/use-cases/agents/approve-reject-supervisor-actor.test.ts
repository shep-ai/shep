/**
 * ApproveAgentRunUseCase / RejectAgentRunUseCase — supervisor-actor
 * extension tests (spec 093, task 28).
 *
 * Verifies the four scenarios called out by the task acceptance criteria:
 *   1. Supervisor-only approve / reject records `actor_id =
 *      supervisor:<id>` on the activity log.
 *   2. User-only approve / reject records `actor_id = user:<id>`.
 *   3. User-overrides-supervisor: a supervisor decision is recorded
 *      first; a subsequent user decision proceeds and BOTH activity-log
 *      rows remain (the log is append-only).
 *   4. Supervisor-cannot-override-user: a user decision is recorded
 *      first; a subsequent supervisor call returns the structured
 *      override-rejected reason and DOES NOT mutate the run status or
 *      append a new audit row.
 *
 * Existing user-only callers that omit the `actor` parameter remain
 * covered by the original use-case unit tests; this file only exercises
 * the new actor-aware paths.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { AgentRunStatus, type ActivityEntry, type AgentRun } from '@/domain/generated/output.js';
import type { IActivityLogRepository } from '@/application/ports/output/repositories/activity-log-repository.interface.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import type { INodeHelpers } from '@/application/ports/output/services/node-helpers.interface.js';
import type { IPhaseTimingContext } from '@/application/ports/output/services/phase-timing-context.interface.js';
import { supervisorActor, userActor } from '@/domain/value-objects/supervisor-actor.js';

// File-system + yaml mocks: Reject's spec.yaml writes are out of scope
// for these tests, so we keep them no-ops.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
}));
vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn().mockReturnValue({}),
    dump: vi.fn().mockReturnValue('yaml'),
  },
}));

class InMemoryActivityLog implements IActivityLogRepository {
  readonly entries: ActivityEntry[] = [];
  async create(entry: ActivityEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
  async listByWorkItem(workItemId: string): Promise<ActivityEntry[]> {
    return this.entries.filter((e) => e.workItemId === workItemId).map((e) => ({ ...e }));
  }
}

function fakeWorktreePaths(): IWorktreePathProvider {
  return {
    getWorktreePath: vi.fn().mockReturnValue('/wt/path'),
  };
}

function fakeNodeHelpers(): INodeHelpers {
  return {
    writeSpecFileAtomic: vi.fn(),
    safeYamlDump: vi.fn().mockReturnValue('yaml'),
  };
}

function fakePhaseTimingContext(): IPhaseTimingContext {
  return {
    recordLifecycleEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRunRepo(run: AgentRun) {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(run),
    findByThreadId: vi.fn(),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
}

function makeProcessService() {
  return {
    spawn: vi.fn().mockReturnValue(123),
    isAlive: vi.fn().mockReturnValue(true),
    checkAndMarkCrashed: vi.fn(),
  };
}

function makeFeatureRepo() {
  const repo = {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  repo.findById.mockResolvedValue({
    id: 'feat-1',
    name: 'feat',
    slug: 'feat',
    branch: 'feat/x',
    repositoryPath: '/repo',
    push: false,
    openPr: false,
    specPath: '/repo/.shep/wt/feat-x',
    worktreePath: '/repo/.shep/wt/feat-x',
  });
  return repo;
}

function makeTimingRepo() {
  return {
    save: vi.fn(),
    update: vi.fn(),
    updateApprovalWait: vi.fn(),
    findByRunId: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn(),
  };
}

function waitingRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-1',
    agentType: 'claude-code' as any,
    agentName: 'feature-agent',
    status: AgentRunStatus.waitingApproval,
    prompt: '...',
    threadId: 'thread-1',
    featureId: 'feat-1',
    repositoryPath: '/repo',
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildApprove(activityLog: IActivityLogRepository, runOverrides?: Partial<AgentRun>) {
  const runRepo = makeRunRepo(waitingRun(runOverrides));
  const proc = makeProcessService();
  const useCase = new ApproveAgentRunUseCase(
    runRepo as any,
    proc as any,
    makeFeatureRepo() as any,
    makeTimingRepo() as any,
    fakeWorktreePaths(),
    fakeNodeHelpers(),
    activityLog,
    { load: vi.fn().mockResolvedValue(null) } as any
  );
  return { useCase, runRepo, proc };
}

function buildReject(activityLog: IActivityLogRepository, runOverrides?: Partial<AgentRun>) {
  const runRepo = makeRunRepo(waitingRun(runOverrides));
  const proc = makeProcessService();
  const useCase = new RejectAgentRunUseCase(
    runRepo as any,
    proc as any,
    makeFeatureRepo() as any,
    makeTimingRepo() as any,
    fakeWorktreePaths(),
    fakeNodeHelpers(),
    fakePhaseTimingContext(),
    activityLog,
    { load: vi.fn().mockResolvedValue(null) } as any
  );
  return { useCase, runRepo, proc };
}

describe('ApproveAgentRunUseCase — supervisor actor', () => {
  let activityLog: InMemoryActivityLog;

  beforeEach(() => {
    activityLog = new InMemoryActivityLog();
  });

  it('records actor_id="supervisor:<id>" when called by a supervisor', async () => {
    const { useCase } = buildApprove(activityLog);

    const result = await useCase.execute('run-1', undefined, supervisorActor('sup-42'));

    expect(result.approved).toBe(true);
    expect(activityLog.entries).toHaveLength(1);
    const entry = activityLog.entries[0];
    expect(entry.actorId).toBe('supervisor:sup-42');
    expect(entry.workItemId).toBe('run-1');
    expect(entry.fieldName).toBe('gate.approval');
    expect(entry.newValue).toBe('approved');
  });

  it('records actor_id="user:<id>" when called by a user', async () => {
    const { useCase } = buildApprove(activityLog);

    const result = await useCase.execute('run-1', undefined, userActor('alice'));

    expect(result.approved).toBe(true);
    expect(activityLog.entries).toHaveLength(1);
    expect(activityLog.entries[0].actorId).toBe('user:alice');
  });

  it('user override: a user decision after a supervisor decision proceeds and both rows remain', async () => {
    const { useCase: superCase } = buildApprove(activityLog);
    await superCase.execute('run-1', undefined, supervisorActor('sup-1'));
    expect(activityLog.entries).toHaveLength(1);

    const { useCase: userCase, proc, runRepo } = buildApprove(activityLog);
    const result = await userCase.execute('run-1', undefined, userActor('alice'));

    expect(result.approved).toBe(true);
    expect(runRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.running,
      expect.any(Object)
    );
    expect(proc.spawn).toHaveBeenCalled();
    expect(activityLog.entries).toHaveLength(2);
    expect(activityLog.entries.map((e) => e.actorId)).toEqual(['supervisor:sup-1', 'user:alice']);
  });

  it('supervisor cannot override a prior user decision: returns refusal and writes nothing', async () => {
    const { useCase: userCase } = buildApprove(activityLog);
    await userCase.execute('run-1', undefined, userActor('alice'));
    expect(activityLog.entries).toHaveLength(1);

    const { useCase: superCase, proc, runRepo } = buildApprove(activityLog);
    const result = await superCase.execute('run-1', undefined, supervisorActor('sup-2'));

    expect(result.approved).toBe(false);
    expect(result.reason).toMatch(/supervisor cannot override/i);
    expect(proc.spawn).not.toHaveBeenCalled();
    expect(runRepo.updateStatus).not.toHaveBeenCalled();
    expect(activityLog.entries).toHaveLength(1);
  });

  it('omitting actor preserves byte-identical legacy behaviour (no audit row)', async () => {
    const { useCase, proc } = buildApprove(activityLog);

    const result = await useCase.execute('run-1');

    expect(result.approved).toBe(true);
    expect(proc.spawn).toHaveBeenCalled();
    expect(activityLog.entries).toHaveLength(0);
  });
});

describe('RejectAgentRunUseCase — supervisor actor', () => {
  let activityLog: InMemoryActivityLog;

  beforeEach(() => {
    activityLog = new InMemoryActivityLog();
  });

  it('records actor_id="supervisor:<id>" on rejection by a supervisor', async () => {
    const { useCase } = buildReject(activityLog);

    const result = await useCase.execute('run-1', 'fix this', undefined, supervisorActor('sup-9'));

    expect(result.rejected).toBe(true);
    expect(activityLog.entries).toHaveLength(1);
    const entry = activityLog.entries[0];
    expect(entry.actorId).toBe('supervisor:sup-9');
    expect(entry.fieldName).toBe('gate.rejection');
    expect(entry.newValue).toBe('rejected');
  });

  it('user-overrides-supervisor on rejection: both rows remain', async () => {
    const { useCase: superCase } = buildReject(activityLog);
    await superCase.execute('run-1', 'sup says no', undefined, supervisorActor('sup-1'));

    const { useCase: userCase } = buildReject(activityLog);
    const result = await userCase.execute('run-1', 'user disagrees', undefined, userActor('bob'));

    expect(result.rejected).toBe(true);
    expect(activityLog.entries).toHaveLength(2);
    expect(activityLog.entries.map((e) => e.actorId)).toEqual(['supervisor:sup-1', 'user:bob']);
  });

  it('supervisor cannot override prior user rejection: returns refusal', async () => {
    const { useCase: userCase } = buildReject(activityLog);
    await userCase.execute('run-1', 'user says no', undefined, userActor('bob'));

    const { useCase: superCase, proc, runRepo } = buildReject(activityLog);
    const result = await superCase.execute(
      'run-1',
      'sup tries',
      undefined,
      supervisorActor('sup-2')
    );

    expect(result.rejected).toBe(false);
    expect(result.reason).toMatch(/supervisor cannot override/i);
    expect(proc.spawn).not.toHaveBeenCalled();
    expect(runRepo.updateStatus).not.toHaveBeenCalled();
    expect(activityLog.entries).toHaveLength(1);
  });

  it('omitting actor preserves byte-identical legacy behaviour (no audit row)', async () => {
    const { useCase, proc } = buildReject(activityLog);

    const result = await useCase.execute('run-1', 'feedback');

    expect(result.rejected).toBe(true);
    expect(proc.spawn).toHaveBeenCalled();
    expect(activityLog.entries).toHaveLength(0);
  });
});
