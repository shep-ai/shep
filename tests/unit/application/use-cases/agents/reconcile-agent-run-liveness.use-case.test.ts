/**
 * ReconcileAgentRunLivenessUseCase Unit Tests
 *
 * `last_heartbeat` was written every 30s and read by nothing, and the only
 * crash check ran when a user pressed Resume. So a hung worker was never
 * detected, a run whose worker died before recording its pid stayed `pending`
 * forever (and Resume refuses `pending`), and a `rebase` run created `running`
 * with no pid stayed running forever once its host died.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconcileAgentRunLivenessUseCase } from '@/application/use-cases/agents/reconcile-agent-run-liveness.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IProcessLivenessProbe } from '@/application/ports/output/services/process-liveness.interface.js';
import type { IProcessTreeTerminator } from '@/application/ports/output/services/process-tree-terminator.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import { AgentRunStatus, AgentType, SdlcLifecycle } from '@/domain/generated/output.js';
import type { AgentRun, Feature } from '@/domain/generated/output.js';
import {
  DEAD_WORKER_GRACE_MS,
  STALE_HEARTBEAT_THRESHOLD_MS,
  WORKER_BOOT_GRACE_MS,
} from '@/domain/shared/agent-run-liveness.js';
import {
  createFakeAgentRunRepository,
  type FakeAgentRunRepository,
} from '../../../../helpers/agent-run-repository.fake.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';

const NOW = new Date('2026-03-01T12:00:00Z');
const PID = 4242;
const EXTRA_MS = 1_000;

const ago = (ms: number) => new Date(NOW.getTime() - ms);

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'p',
    threadId: 't',
    featureId: 'feat-1',
    pid: PID,
    lastHeartbeat: NOW,
    createdAt: ago(WORKER_BOOT_GRACE_MS * 2),
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    lifecycle: SdlcLifecycle.Implementation,
    agentRunId: 'run-1',
    ...overrides,
  } as Feature;
}

describe('ReconcileAgentRunLivenessUseCase', () => {
  let runs: FakeAgentRunRepository;
  let features: ReturnType<typeof createMockFeatureRepository>;
  let alive: boolean;
  let terminator: { terminateTree: ReturnType<typeof vi.fn> };
  let logger: ILogger;

  const useCase = () =>
    new ReconcileAgentRunLivenessUseCase(
      runs as unknown as IAgentRunRepository,
      features as unknown as IFeatureRepository,
      { isProcessAlive: () => alive } as IProcessLivenessProbe,
      terminator as unknown as IProcessTreeTerminator,
      logger
    );

  const seed = (run: AgentRun) => {
    runs = createFakeAgentRunRepository([run]);
  };

  beforeEach(() => {
    runs = createFakeAgentRunRepository();
    features = createMockFeatureRepository();
    features.findById.mockResolvedValue(makeFeature());
    alive = true;
    terminator = { terminateTree: vi.fn().mockResolvedValue(undefined) };
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  describe('dead worker', () => {
    it('marks a running run whose worker is gone as crashed (resumable)', async () => {
      seed(makeRun({ updatedAt: ago(DEAD_WORKER_GRACE_MS + EXTRA_MS) }));
      alive = false;

      const result = await useCase().execute(NOW);

      expect(result.reconciledRunIds).toEqual(['run-1']);
      const run = runs.peek('run-1');
      expect(run?.status).toBe(AgentRunStatus.interrupted);
      expect(run?.error).toContain(`PID ${PID}`);
      expect(terminator.terminateTree).not.toHaveBeenCalled();
    });

    it('leaves a run alone while a new worker may still be taking it over', async () => {
      // Approve/Reject claim the row as running before the new worker's boot
      // claim replaces the old, exited worker's pid.
      seed(makeRun({ updatedAt: ago(DEAD_WORKER_GRACE_MS - EXTRA_MS) }));
      alive = false;

      await useCase().execute(NOW);

      expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.running);
    });

    it('leaves a pending run carrying the previous worker pid alone — a respawn is in flight', async () => {
      seed(
        makeRun({
          status: AgentRunStatus.pending,
          updatedAt: ago(DEAD_WORKER_GRACE_MS + EXTRA_MS),
        })
      );
      alive = false;

      await useCase().execute(NOW);

      expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.pending);
    });
  });

  describe('hung worker', () => {
    it('fails a live worker whose heartbeat went stale and kills its process tree', async () => {
      const stale = ago(STALE_HEARTBEAT_THRESHOLD_MS + EXTRA_MS);
      seed(makeRun({ lastHeartbeat: stale, updatedAt: stale }));

      const result = await useCase().execute(NOW);

      expect(result.reconciledRunIds).toEqual(['run-1']);
      const run = runs.peek('run-1');
      expect(run?.status).toBe(AgentRunStatus.failed);
      expect(run?.error).toMatch(/stopped responding.*heartbeat/i);
      // Its event loop is wedged, so its SIGTERM handler cannot run.
      expect(terminator.terminateTree).toHaveBeenCalledWith(PID, { force: true });
    });

    it('does not touch a worker with a fresh heartbeat', async () => {
      seed(makeRun({ lastHeartbeat: ago(STALE_HEARTBEAT_THRESHOLD_MS - EXTRA_MS) }));

      const result = await useCase().execute(NOW);

      expect(result.reconciledRunIds).toEqual([]);
      expect(terminator.terminateTree).not.toHaveBeenCalled();
    });

    it('neither fails nor kills a worker whose heartbeat lands between the read and the write', async () => {
      const stale = ago(STALE_HEARTBEAT_THRESHOLD_MS + EXTRA_MS);
      seed(makeRun({ lastHeartbeat: stale, updatedAt: stale }));
      // The sweep reads the stale row; the worker's overdue heartbeat (a laptop
      // waking up) lands before the sweep writes.
      runs.list.mockImplementationOnce(async () => {
        const judged = { ...runs.peek('run-1')! };
        runs.seed({ ...judged, lastHeartbeat: NOW, updatedAt: NOW });
        return [judged];
      });

      await useCase().execute(NOW);

      expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.running);
      expect(terminator.terminateTree).not.toHaveBeenCalled();
    });
  });

  describe('worker never started', () => {
    it('fails a pending run with no pid once the boot grace has passed', async () => {
      seed(
        makeRun({
          status: AgentRunStatus.pending,
          pid: undefined,
          lastHeartbeat: undefined,
          updatedAt: ago(WORKER_BOOT_GRACE_MS + EXTRA_MS),
        })
      );

      await useCase().execute(NOW);

      const run = runs.peek('run-1');
      expect(run?.status).toBe(AgentRunStatus.failed);
      expect(run?.error).toMatch(/never started/i);
    });

    it('fails a pid-less running rebase run whose host died', async () => {
      seed(
        makeRun({
          id: 'rebase-1',
          agentName: 'rebase',
          pid: undefined,
          lastHeartbeat: undefined,
          updatedAt: ago(WORKER_BOOT_GRACE_MS + EXTRA_MS),
        })
      );

      await useCase().execute(NOW);

      expect(runs.peek('rebase-1')?.status).toBe(AgentRunStatus.failed);
    });

    it('waits out the boot grace', async () => {
      seed(
        makeRun({
          status: AgentRunStatus.pending,
          pid: undefined,
          updatedAt: ago(WORKER_BOOT_GRACE_MS - EXTRA_MS),
        })
      );

      await useCase().execute(NOW);

      expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.pending);
    });

    it.each([
      ['Blocked on its parent', { lifecycle: SdlcLifecycle.Blocked }],
      ['deferred by the user', { lifecycle: SdlcLifecycle.Pending }],
      [
        'queued for a capacity slot',
        { lifecycle: SdlcLifecycle.Pending, queuedAt: new Date('2026-01-01T00:00:00Z') },
      ],
    ])('leaves the pending run of a feature %s alone', async (_label, feature) => {
      seed(
        makeRun({
          status: AgentRunStatus.pending,
          pid: undefined,
          updatedAt: ago(WORKER_BOOT_GRACE_MS * 10),
        })
      );
      features.findById.mockResolvedValue(makeFeature(feature));

      await useCase().execute(NOW);

      expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.pending);
    });

    it('leaves a pid-less run with no feature alone — an in-process run has no worker to lose', async () => {
      seed(
        makeRun({
          featureId: undefined,
          pid: undefined,
          updatedAt: ago(WORKER_BOOT_GRACE_MS * 10),
        })
      );

      await useCase().execute(NOW);

      expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.running);
    });
  });

  it('never touches a run parked at an approval gate — its worker exits by design', async () => {
    seed(
      makeRun({
        status: AgentRunStatus.waitingApproval,
        updatedAt: ago(WORKER_BOOT_GRACE_MS * 10),
      })
    );
    alive = false;

    await useCase().execute(NOW);

    expect(runs.peek('run-1')?.status).toBe(AgentRunStatus.waitingApproval);
  });

  it('isolates a failure on one run and logs it', async () => {
    seed(makeRun({ updatedAt: ago(DEAD_WORKER_GRACE_MS + EXTRA_MS) }));
    alive = false;
    runs.updateStatus.mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    const result = await useCase().execute(NOW);

    expect(result.reconciledRunIds).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ runId: 'run-1', error: 'SQLITE_BUSY' })
    );
  });

  it('never throws out of a read path when the runs cannot be listed', async () => {
    runs.list.mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    await expect(useCase().execute(NOW)).resolves.toEqual({ reconciledRunIds: [] });
    expect(logger.warn).toHaveBeenCalled();
  });
});
