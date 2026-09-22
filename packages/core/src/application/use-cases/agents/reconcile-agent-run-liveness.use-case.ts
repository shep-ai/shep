/**
 * ReconcileAgentRunLivenessUseCase
 *
 * Self-healing sweep that restores "a run that says it is working has a
 * worker that is working". Before it existed, `last_heartbeat` was written
 * every 30s and read by nothing, and the only crash check ran when a user
 * pressed Resume, so:
 *
 * - a live-but-hung worker (wedged event loop) was never detected;
 * - a run whose worker died before recording its pid stayed `pending` forever,
 *   and Resume refuses `pending`;
 * - a `rebase` run, created `running` with no pid by the process that performs
 *   the rebase, stayed `running` forever once that process died.
 *
 * Mirrors ReconcileStuckClusterUseCase: idempotent, cheap when the invariant
 * holds (one indexed query of the pending/running runs plus a pid probe each),
 * and injected into the read paths every surface uses — feature list/show and
 * agent list/show — so the CLI, TUI and web all trigger it.
 *
 * Every write is decided from a read, so every write carries that read in its
 * WHERE clause: the status it saw (`allowedFrom`) AND the exact `updatedAt` it
 * judged (`expectedUpdatedAt`). A heartbeat, or a new worker's boot claim, that
 * lands in between refreshes `updated_at` and the write refuses — which is
 * also the only thing allowed to decide whether a hung worker is killed.
 */

import { injectable, inject } from 'tsyringe';
import { AgentRunStatus } from '../../../domain/generated/output.js';
import type { AgentRun } from '../../../domain/generated/output.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';
import type { IProcessTreeTerminator } from '../../ports/output/services/process-tree-terminator.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import {
  DEAD_WORKER_GRACE_MS,
  STALE_HEARTBEAT_THRESHOLD_MS,
  WORKER_BOOT_GRACE_MS,
  crashedWorkerMessage,
  isOlderThan,
  thresholdMinutes,
} from '../../../domain/shared/agent-run-liveness.js';
import {
  isQueuedForCapacity,
  isRunningLifecycle,
} from '../../../domain/shared/parallel-feature-limit.js';

/**
 * The statuses that claim a worker is (about to be) working. `waiting_approval`
 * is absent on purpose: the worker exits by design while a run waits on a
 * human, so a dead pid there is the normal state, not a crash.
 */
const SWEPT_STATUSES: readonly AgentRunStatus[] = [AgentRunStatus.pending, AgentRunStatus.running];

export interface ReconcileAgentRunLivenessOutput {
  /** Runs this sweep moved to a terminal status. */
  reconciledRunIds: string[];
}

function hungWorkerMessage(pid: number): string {
  return (
    `Agent worker (PID ${pid}) stopped responding — no heartbeat for over ` +
    `${thresholdMinutes(STALE_HEARTBEAT_THRESHOLD_MS)} minutes; it was terminated`
  );
}

function neverStartedMessage(): string {
  return (
    `Agent worker never started — no process picked this run up within ` +
    `${thresholdMinutes(WORKER_BOOT_GRACE_MS)} minutes`
  );
}

@injectable()
export class ReconcileAgentRunLivenessUseCase {
  constructor(
    @inject('IAgentRunRepository') private readonly runRepo: IAgentRunRepository,
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject('IProcessLivenessProbe') private readonly liveness: IProcessLivenessProbe,
    @inject('IProcessTreeTerminator') private readonly terminator: IProcessTreeTerminator,
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  /**
   * Never throws: it runs inside read paths, and a failed sweep must not turn
   * `feat ls` into an error. Failures are logged and retried by the next read.
   */
  async execute(now: Date = new Date()): Promise<ReconcileAgentRunLivenessOutput> {
    const reconciledRunIds: string[] = [];
    let runs: AgentRun[];
    try {
      runs = await this.runRepo.list({ statuses: SWEPT_STATUSES });
    } catch (error) {
      this.logger.warn('Agent run liveness sweep could not list runs', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { reconciledRunIds };
    }

    for (const run of runs) {
      try {
        if (await this.reconcile(run, now)) reconciledRunIds.push(run.id);
      } catch (error) {
        // Isolate per run — one busy write must not leave every other stuck
        // run stuck for another whole sweep.
        this.logger.warn('Agent run liveness check failed', {
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { reconciledRunIds };
  }

  private reconcile(run: AgentRun, now: Date): Promise<boolean> {
    return run.pid ? this.reconcileWorker(run, run.pid, now) : this.reconcileUnstarted(run, now);
  }

  private async reconcileWorker(run: AgentRun, pid: number, now: Date): Promise<boolean> {
    // A pending run that still carries a pid is being handed to a new worker:
    // a respawn re-arms the old row to pending, and the pid is the previous
    // worker's until the new one's boot claim replaces it.
    if (run.status !== AgentRunStatus.running) return false;

    if (!this.liveness.isProcessAlive(pid)) {
      if (!isOlderThan(run.updatedAt, DEAD_WORKER_GRACE_MS, now)) return false;
      // Interrupted, like the Resume-time crash check: the run is resumable.
      return this.finish(run, AgentRunStatus.interrupted, crashedWorkerMessage(pid), now);
    }

    const lastSignOfLife = run.lastHeartbeat ?? run.startedAt ?? run.updatedAt;
    if (!isOlderThan(lastSignOfLife, STALE_HEARTBEAT_THRESHOLD_MS, now)) return false;

    const failed = await this.finish(run, AgentRunStatus.failed, hungWorkerMessage(pid), now);
    // Only the write that won may kill: a heartbeat that landed first means the
    // worker is alive after all. Forced, because a worker whose event loop is
    // wedged can never run its SIGTERM handler.
    if (failed) await this.terminator.terminateTree(pid, { force: true });
    return failed;
  }

  private async reconcileUnstarted(run: AgentRun, now: Date): Promise<boolean> {
    if (!run.featureId || !isOlderThan(run.updatedAt, WORKER_BOOT_GRACE_MS, now)) return false;

    // Only a run something promised to start. A Blocked, user-deferred or
    // capacity-queued feature legitimately holds a pending run with no worker
    // for as long as it waits; a run with no feature is an in-process run with
    // no worker to lose.
    const feature = await this.featureRepo.findById(run.featureId);
    if (!feature || !isRunningLifecycle(feature.lifecycle) || isQueuedForCapacity(feature)) {
      return false;
    }

    return this.finish(run, AgentRunStatus.failed, neverStartedMessage(), now);
  }

  private finish(
    run: AgentRun,
    status: AgentRunStatus,
    error: string,
    now: Date
  ): Promise<boolean> {
    return this.runRepo.updateStatus(
      run.id,
      status,
      { error, completedAt: now, updatedAt: now },
      { allowedFrom: [run.status], expectedUpdatedAt: run.updatedAt }
    );
  }
}
