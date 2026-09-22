/**
 * Worker run-status writes.
 *
 * The worker shares its run row with Stop, Approve/Reject and the crash sweep,
 * each in another process. These helpers put the worker's ownership rule in
 * the repository's WHERE clause: it may assert `running` only while the run is
 * pending or already running, and may finish a run only while it is running.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentRunStatus, SdlcLifecycle, type AgentRun } from '@/domain/generated/output.js';
import {
  claimRunForWorker,
  finishRun,
  recordRunFailure,
  startRunHeartbeat,
} from '@/infrastructure/services/agents/feature-agent/worker-run-status.js';
import { createFakeAgentRunRepository } from '../../../../../helpers/agent-run-repository.fake.js';

const RUN_ID = 'run-ws';
const HEARTBEAT_MS = 30_000;

function makeRun(status: AgentRunStatus): AgentRun {
  return {
    id: RUN_ID,
    agentType: 'claude-code' as AgentRun['agentType'],
    agentName: 'feature-agent',
    status,
    prompt: 'test',
    threadId: 'thread-ws',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('claimRunForWorker', () => {
  it.each([AgentRunStatus.pending, AgentRunStatus.running])(
    'claims a %s run and records the worker PID',
    async (status) => {
      const repo = createFakeAgentRunRepository([makeRun(status)]);

      await expect(claimRunForWorker(repo, RUN_ID, 4242, new Date())).resolves.toBe(true);

      expect(repo.peek(RUN_ID)).toMatchObject({ status: AgentRunStatus.running, pid: 4242 });
    }
  );

  it.each([
    AgentRunStatus.interrupted,
    AgentRunStatus.cancelled,
    AgentRunStatus.completed,
    AgentRunStatus.failed,
    AgentRunStatus.waitingApproval,
  ])('refuses a %s run and leaves it untouched', async (status) => {
    const repo = createFakeAgentRunRepository([makeRun(status)]);

    await expect(claimRunForWorker(repo, RUN_ID, 4242, new Date())).resolves.toBe(false);

    expect(repo.peek(RUN_ID)?.status).toBe(status);
    expect(repo.peek(RUN_ID)?.pid).toBeUndefined();
  });
});

describe('finishRun', () => {
  it('writes the terminal status while the worker still owns the run', async () => {
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.running)]);

    await expect(
      finishRun(repo, RUN_ID, AgentRunStatus.completed, { updatedAt: new Date() })
    ).resolves.toBe(true);

    expect(repo.peek(RUN_ID)?.status).toBe(AgentRunStatus.completed);
  });

  it('leaves a stopped run interrupted', async () => {
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.interrupted)]);

    await expect(
      finishRun(repo, RUN_ID, AgentRunStatus.completed, { updatedAt: new Date() })
    ).resolves.toBe(false);

    expect(repo.peek(RUN_ID)?.status).toBe(AgentRunStatus.interrupted);
  });
});

describe('startRunHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not resurrect a run stopped mid-run', async () => {
    vi.useFakeTimers();
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.running)]);
    const stop = startRunHeartbeat(repo, RUN_ID, HEARTBEAT_MS, vi.fn());

    repo.seed({ ...repo.peek(RUN_ID)!, status: AgentRunStatus.interrupted });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    stop();

    expect(repo.updateStatus).toHaveBeenCalledTimes(1);
    expect(repo.peek(RUN_ID)?.status).toBe(AgentRunStatus.interrupted);
  });

  it('refreshes lastHeartbeat on a running run', async () => {
    vi.useFakeTimers();
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.running)]);
    const stop = startRunHeartbeat(repo, RUN_ID, HEARTBEAT_MS, vi.fn());

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    stop();

    expect(repo.peek(RUN_ID)?.status).toBe(AgentRunStatus.running);
    expect(repo.peek(RUN_ID)?.lastHeartbeat).toBeInstanceOf(Date);
  });

  it('logs a failed heartbeat write and keeps beating', async () => {
    vi.useFakeTimers();
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.running)]);
    repo.updateStatus.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const log = vi.fn();
    const stop = startRunHeartbeat(repo, RUN_ID, HEARTBEAT_MS, log);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    stop();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('SQLITE_BUSY'));
    expect(repo.updateStatus).toHaveBeenCalledTimes(2);
  });
});

describe('recordRunFailure', () => {
  function makeDeps(runStatus: AgentRunStatus = AgentRunStatus.running) {
    const runRepository = createFakeAgentRunRepository([makeRun(runStatus)]);
    const featureRepository = {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'feat-ws', lifecycle: SdlcLifecycle.Implementation }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    return {
      runRepository,
      featureRepository,
      recordLifecycleEvent: vi.fn().mockResolvedValue(undefined),
      drainCapacityQueue: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
    };
  }
  const input = { runId: RUN_ID, featureId: 'feat-ws', message: 'boom', failedAt: new Date() };

  // A failed run releases its parallel-feature slot even though the lifecycle
  // is reset to Started, so the failure is one of the events that must drain
  // the capacity queue — otherwise a queued feature waits for an unrelated
  // transition that may never come.
  it('drains the capacity queue once the failure has freed the slot', async () => {
    const deps = makeDeps();

    await recordRunFailure(deps, input);

    expect(deps.drainCapacityQueue).toHaveBeenCalledOnce();
  });

  it('does not drain when the run was already stopped by someone else', async () => {
    const deps = makeDeps(AgentRunStatus.interrupted);

    await recordRunFailure(deps, input);

    expect(deps.drainCapacityQueue).not.toHaveBeenCalled();
  });

  it('logs a drain failure instead of throwing', async () => {
    const deps = makeDeps();
    deps.drainCapacityQueue.mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    await expect(recordRunFailure(deps, input)).resolves.toBeUndefined();

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('SQLITE_BUSY'));
  });

  it('marks the run failed, resets the lifecycle and records run:failed', async () => {
    const deps = makeDeps();

    await recordRunFailure(deps, input);

    expect(deps.runRepository.peek(RUN_ID)).toMatchObject({
      status: AgentRunStatus.failed,
      error: 'boom',
    });
    expect(deps.featureRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: SdlcLifecycle.Started })
    );
    expect(deps.recordLifecycleEvent).toHaveBeenCalledWith('run:failed');
    expect(deps.log).toHaveBeenCalledWith('Run marked as failed');
  });

  it('still resets the lifecycle, records run:failed and logs when the status write throws', async () => {
    const deps = makeDeps();
    deps.runRepository.updateStatus.mockRejectedValueOnce(new Error('SQLITE_BUSY: locked'));

    await expect(recordRunFailure(deps, input)).resolves.toBeUndefined();

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('SQLITE_BUSY: locked'));
    expect(deps.featureRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: SdlcLifecycle.Started })
    );
    expect(deps.recordLifecycleEvent).toHaveBeenCalledWith('run:failed');
    expect(deps.log).toHaveBeenCalledWith('Run marked as failed');
  });

  it('does not mark a stopped run failed', async () => {
    const deps = makeDeps(AgentRunStatus.interrupted);

    await recordRunFailure(deps, input);

    expect(deps.runRepository.peek(RUN_ID)?.status).toBe(AgentRunStatus.interrupted);
    expect(deps.recordLifecycleEvent).not.toHaveBeenCalled();
  });
});
