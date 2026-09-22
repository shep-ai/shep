/**
 * Worker run-status writes.
 *
 * A feature run's row is written by several processes: this worker, Stop
 * (`interrupted`), Approve/Reject (`running` before they spawn a resume
 * worker), the crash sweep, and the PR-sync watcher. Every write the worker
 * makes therefore carries its ownership rule in the repository's WHERE clause
 * (`allowedFrom`), never in an `if` above the write — an earlier read is a
 * check another process can invalidate before the write lands.
 *
 * - The worker may assert `running` (boot claim, heartbeats) only while the run
 *   is `pending` or already `running`. Every spawner leaves the run in one of
 *   those: create/resume/promote create a `pending` run, SpawnFeatureAgent
 *   re-arms a stopped one to `pending`, Approve/Reject claim it as `running`.
 * - The worker may finish a run (completed / failed / waiting_approval) only
 *   while it is still `running`. A Stop that landed first wins.
 */

import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { AgentRunStatus, SdlcLifecycle, type AgentRun } from '@/domain/generated/output.js';

/** Statuses from which the worker may (re)assert `running`. */
export const WORKER_CLAIMABLE_STATUSES: readonly AgentRunStatus[] = [
  AgentRunStatus.pending,
  AgentRunStatus.running,
];

/** Statuses from which the worker may write a terminal or paused status. */
export const WORKER_OWNED_STATUSES: readonly AgentRunStatus[] = [AgentRunStatus.running];

type WorkerLog = (message: string) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The worker's boot claim: mark the run `running` with this process's PID.
 *
 * @returns false when the run is no longer the worker's to run (stopped,
 *   cancelled or finished before the worker booted) — the caller must exit
 *   without building or invoking the graph.
 */
export function claimRunForWorker(
  repository: IAgentRunRepository,
  runId: string,
  pid: number,
  now: Date
): Promise<boolean> {
  return repository.updateStatus(
    runId,
    AgentRunStatus.running,
    { pid, startedAt: now, lastHeartbeat: now, updatedAt: now },
    { allowedFrom: WORKER_CLAIMABLE_STATUSES }
  );
}

/** Refresh heartbeat fields without resurrecting a run that was stopped. */
export function writeRunHeartbeat(
  repository: IAgentRunRepository,
  runId: string,
  updates: Partial<AgentRun>
): Promise<boolean> {
  return repository.updateStatus(runId, AgentRunStatus.running, updates, {
    allowedFrom: WORKER_CLAIMABLE_STATUSES,
  });
}

/**
 * Start the periodic liveness heartbeat.
 * @returns a function that stops the interval.
 */
export function startRunHeartbeat(
  repository: IAgentRunRepository,
  runId: string,
  intervalMs: number,
  log: WorkerLog
): () => void {
  const interval = setInterval(async () => {
    try {
      const now = new Date();
      await writeRunHeartbeat(repository, runId, { lastHeartbeat: now, updatedAt: now });
    } catch (error) {
      // Heartbeat failure is non-fatal — the next tick tries again.
      log(`Heartbeat update failed (non-fatal): ${errorMessage(error)}`);
    }
  }, intervalMs);

  return () => clearInterval(interval);
}

/**
 * Write a terminal (or paused) status while the worker still owns the run.
 *
 * @returns false when another process moved the run on first (e.g. Stop).
 */
export function finishRun(
  repository: IAgentRunRepository,
  runId: string,
  status: AgentRunStatus,
  updates: Partial<AgentRun>
): Promise<boolean> {
  return repository.updateStatus(runId, status, updates, {
    allowedFrom: WORKER_OWNED_STATUSES,
  });
}

export interface RunFailureDeps {
  runRepository: IAgentRunRepository;
  featureRepository: Pick<IFeatureRepository, 'findById' | 'update'>;
  recordLifecycleEvent: (event: string) => Promise<void>;
  log: WorkerLog;
}

export interface RunFailureInput {
  runId: string;
  featureId: string;
  message: string;
  failedAt: Date;
}

/**
 * Record a graph failure. Each step is independent: a failed status write
 * (SQLITE_BUSY) must not skip the lifecycle reset, the event or the log line,
 * or the feature is left looking busy in a phase nothing is running.
 */
export async function recordRunFailure(
  deps: RunFailureDeps,
  input: RunFailureInput
): Promise<void> {
  const { runRepository, featureRepository, recordLifecycleEvent, log } = deps;
  const { runId, featureId, message, failedAt } = input;

  // undefined = the write threw, so the outcome is unknown; the run did fail.
  let marked: boolean | undefined;
  try {
    marked = await finishRun(runRepository, runId, AgentRunStatus.failed, {
      error: message,
      completedAt: failedAt,
      updatedAt: failedAt,
    });
    if (!marked) {
      log('Run status left unchanged: the run is no longer running (stopped by another process)');
    }
  } catch (writeErr) {
    log(`Failed to mark run as failed: ${errorMessage(writeErr)}`);
  }

  // Reset the feature lifecycle to Started so it doesn't appear stuck
  // in a running phase (e.g., Requirements, Implementation) when the agent has failed.
  try {
    const feature = await featureRepository.findById(featureId);
    if (feature && feature.lifecycle !== SdlcLifecycle.Maintain) {
      await featureRepository.update({
        ...feature,
        lifecycle: SdlcLifecycle.Started,
        updatedAt: failedAt,
      });
      log('Feature lifecycle reset to Started');
    }
  } catch (resetErr) {
    log(`Failed to reset feature lifecycle: ${errorMessage(resetErr)}`);
  }

  if (marked === false) return;

  try {
    await recordLifecycleEvent('run:failed');
  } catch (eventErr) {
    log(`Failed to record run:failed event: ${errorMessage(eventErr)}`);
  }
  log('Run marked as failed');
}
