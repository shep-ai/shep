/**
 * The claim Approve and Reject make on a paused run before spawning a resume
 * worker.
 *
 * Both read the run, check its status and then do slow work (spec.yaml,
 * timings, settings). A check made from that read is one another process can
 * invalidate — a web double-click, or CLI and web at once, both pass it and
 * spawn two workers into one worktree. The status condition therefore lives in
 * the write's WHERE clause, and only the caller whose write changed the row may
 * spawn.
 */

import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';

/** Statuses from which a run may be approved or rejected into a resume. */
export const RESUMABLE_RUN_STATUSES: readonly AgentRunStatus[] = [
  AgentRunStatus.waitingApproval,
  AgentRunStatus.failed,
  AgentRunStatus.interrupted,
];

const CLAIMED_RUN_STATUSES: readonly AgentRunStatus[] = [AgentRunStatus.running];

/**
 * Atomically move a resumable run to `running`, clearing the previous
 * worker's PID in the same statement so a Stop issued before the resume worker
 * boots cannot signal a dead (and possibly reused) PID.
 *
 * @returns true only for the caller that won the run.
 */
export function claimRunForResume(
  repository: IAgentRunRepository,
  runId: string,
  now: Date
): Promise<boolean> {
  return repository.updateStatus(
    runId,
    AgentRunStatus.running,
    { pid: null, updatedAt: now },
    { allowedFrom: RESUMABLE_RUN_STATUSES }
  );
}

/**
 * Start the resume worker for a run this caller has claimed.
 *
 * The claim already moved the run to `running`. If starting the worker throws
 * (settings unreadable, fork failure) nothing will ever boot to own that
 * `running`, so the claim is handed back — the run returns to the status it was
 * claimed from and can be approved, rejected or resumed again. The release is
 * itself guarded on `running`, so it never overwrites a Stop that landed first.
 *
 * @returns The worker PID, also recorded on the run.
 */
export async function startClaimedResumeWorker(
  repository: IAgentRunRepository,
  runId: string,
  claimedFrom: AgentRunStatus,
  start: () => Promise<number>
): Promise<number> {
  let pid: number;
  try {
    pid = await start();
  } catch (error) {
    await repository
      .updateStatus(
        runId,
        claimedFrom,
        { updatedAt: new Date() },
        { allowedFrom: CLAIMED_RUN_STATUSES }
      )
      .catch(() => undefined);
    throw error;
  }
  await recordResumeWorkerPid(repository, runId, pid);
  return pid;
}

/**
 * Record the resume worker's PID so Stop can signal it before it boots.
 * Best-effort: the worker records its own PID when it claims the run, and a
 * Stop that landed in between wins (the write only applies while `running`).
 */
async function recordResumeWorkerPid(
  repository: IAgentRunRepository,
  runId: string,
  pid: number
): Promise<void> {
  try {
    await repository.updateStatus(
      runId,
      AgentRunStatus.running,
      { pid, updatedAt: new Date() },
      { allowedFrom: CLAIMED_RUN_STATUSES }
    );
  } catch {
    // The worker writes its PID at boot; losing this write only delays that.
  }
}
