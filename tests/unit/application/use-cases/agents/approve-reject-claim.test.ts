/**
 * Approve / Reject claim the run atomically.
 *
 * Both use cases read the run, checked its status, awaited several things and
 * then wrote `running` unconditionally before spawning a resume worker. Two
 * approves (a web double-click, or CLI and web at once) both passed the check
 * and spawned two workers into one worktree. The waiting -> running write is
 * now the claim: it carries the status condition in the repository's WHERE
 * clause, and only the caller whose write changed the row spawns.
 *
 * The repository double is the in-memory fake that applies `allowedFrom` in
 * one synchronous step, the same guarantee the SQLite statement gives.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunStatus, type AgentRun } from '@/domain/generated/output.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import {
  createFakeAgentRunRepository,
  type FakeAgentRunRepository,
} from '../../../../helpers/agent-run-repository.fake.js';

const RUN_ID = 'run-claim';
const NEW_WORKER_PID = 5555;
const OLD_WORKER_PID = 1111;

function waitingRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: RUN_ID,
    agentType: 'claude-code' as AgentRun['agentType'],
    agentName: 'feature-agent',
    status: AgentRunStatus.waitingApproval,
    prompt: 'Test prompt',
    threadId: 'thread-claim',
    featureId: 'feat-claim',
    repositoryPath: '/test/repo',
    pid: OLD_WORKER_PID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Approve / Reject run claim', () => {
  let runRepo: FakeAgentRunRepository;
  let processService: { spawn: ReturnType<typeof vi.fn> };
  let approve: ApproveAgentRunUseCase;
  let reject: RejectAgentRunUseCase;

  beforeEach(() => {
    runRepo = createFakeAgentRunRepository([waitingRun()]);
    processService = { spawn: vi.fn().mockReturnValue(NEW_WORKER_PID) };
    const featureRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'feat-claim',
        branch: 'feat/claim',
        repositoryPath: '/test/repo',
        // A spec dir that does not exist: both use cases treat spec.yaml
        // read failures as non-fatal.
        specPath: '/nonexistent/spec-dir-for-claim-test',
        worktreePath: '/test/repo/.shep/wt/claim',
      }),
    };
    const timingRepo = {
      findByRunId: vi.fn().mockResolvedValue([]),
      updateApprovalWait: vi.fn(),
    };
    const worktreePaths = { getWorktreePath: vi.fn().mockReturnValue('/wt') };
    const nodeHelpers = { writeSpecFileAtomic: vi.fn(), safeYamlDump: vi.fn() };
    const activityLog = { create: vi.fn(), listByWorkItem: vi.fn().mockResolvedValue([]) };
    const settingsRepo = { load: vi.fn().mockResolvedValue(null) };

    approve = new ApproveAgentRunUseCase(
      runRepo as never,
      processService as never,
      featureRepo as never,
      timingRepo as never,
      worktreePaths,
      nodeHelpers,
      activityLog as never,
      settingsRepo as never
    );
    reject = new RejectAgentRunUseCase(
      runRepo as never,
      processService as never,
      featureRepo as never,
      timingRepo as never,
      worktreePaths,
      nodeHelpers,
      { recordLifecycleEvent: vi.fn().mockResolvedValue(undefined) },
      activityLog as never,
      settingsRepo as never
    );
  });

  it('hands the claim back when the approve worker fails to start', async () => {
    processService.spawn.mockImplementation(() => {
      throw new Error('fork failed');
    });

    await expect(approve.execute(RUN_ID)).rejects.toThrow('fork failed');

    // Nothing will boot to own `running`, so the run must be approvable again.
    expect(runRepo.peek(RUN_ID)?.status).toBe(AgentRunStatus.waitingApproval);
  });

  it('hands the claim back when the reject worker fails to start', async () => {
    processService.spawn.mockImplementation(() => {
      throw new Error('fork failed');
    });

    await expect(reject.execute(RUN_ID, 'redo it')).rejects.toThrow('fork failed');

    expect(runRepo.peek(RUN_ID)?.status).toBe(AgentRunStatus.waitingApproval);
  });

  it('two concurrent approves spawn exactly one worker', async () => {
    const results = await Promise.all([approve.execute(RUN_ID), approve.execute(RUN_ID)]);

    expect(processService.spawn).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.approved)).toHaveLength(1);
    const loser = results.find((r) => !r.approved)!;
    expect(loser.reason).toContain('not in an approvable state');
  });

  it('two concurrent rejects spawn exactly one worker', async () => {
    const results = await Promise.all([
      reject.execute(RUN_ID, 'redo it'),
      reject.execute(RUN_ID, 'redo it'),
    ]);

    expect(processService.spawn).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.rejected)).toHaveLength(1);
    const loser = results.find((r) => !r.rejected)!;
    expect(loser.reason).toContain('not in a rejectable state');
  });

  it('a concurrent approve and reject spawn exactly one worker', async () => {
    const [approved, rejected] = await Promise.all([
      approve.execute(RUN_ID),
      reject.execute(RUN_ID, 'redo it'),
    ]);

    expect(processService.spawn).toHaveBeenCalledTimes(1);
    expect([approved.approved, rejected.rejected].filter(Boolean)).toHaveLength(1);
  });

  it.each([
    ['approve', () => approve.execute(RUN_ID)],
    ['reject', () => reject.execute(RUN_ID, 'redo it')],
  ])('%s replaces the old worker PID with the resume worker PID', async (_name, run) => {
    await run();

    expect(runRepo.peek(RUN_ID)).toMatchObject({
      status: AgentRunStatus.running,
      pid: NEW_WORKER_PID,
    });
  });

  it.each([
    ['approve', () => approve.execute(RUN_ID)],
    ['reject', () => reject.execute(RUN_ID, 'redo it')],
  ])('%s never exposes the old worker PID once the run is claimed', async (_name, run) => {
    // Observe the row at the moment of the spawn: a Stop that reads it then
    // must not SIGTERM the dead (possibly reused) PID of the previous worker.
    let pidAtSpawn: number | undefined | null = OLD_WORKER_PID;
    processService.spawn.mockImplementation(() => {
      pidAtSpawn = runRepo.peek(RUN_ID)?.pid;
      return NEW_WORKER_PID;
    });

    await run();

    expect(pidAtSpawn ?? undefined).toBeUndefined();
  });
});
