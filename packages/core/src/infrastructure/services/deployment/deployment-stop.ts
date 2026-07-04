/**
 * Graceful stop flow for deployments: SIGTERM → poll → SIGKILL.
 *
 * Transient (pre-spawn) entries are simply removed — there is no process to
 * kill and nothing was persisted. Orphan rows (in DB but not in memory) are
 * SIGKILLed directly since we have no ChildProcess handle to wait on.
 */

import { createDeploymentLogger } from './deployment-logger.js';
import { isTransientEntry } from './deployment-entry.js';
import { pollUntilDead, waitForExit } from './deployment-process-control.js';
import type { DeploymentContext } from './deployment-context.js';

const log = createDeploymentLogger('[DeploymentService]');
const POLL_INTERVAL_MS = 200;
const MAX_WAIT_MS = 5000;
const WAIT_FOR_EXIT_TIMEOUT_MS = 1000;

/** Stop a deployment gracefully: SIGTERM → poll → SIGKILL. */
export async function stopDeployment(ctx: DeploymentContext, targetId: string): Promise<void> {
  const entry = ctx.deployments.get(targetId);
  if (entry && isTransientEntry(entry)) {
    // Transient pre-spawn entry — no process to kill, nothing persisted.
    log.info(`stop("${targetId}") — removing transient ${entry.state} entry`);
    ctx.deployments.delete(targetId);
    return;
  }
  if (!entry) {
    // Check DB in case it's a recovered orphan
    const row = ctx.dbStore.find(targetId);
    if (row && ctx.isAlive(row.pid)) {
      log.info(`stop("${targetId}") — killing orphan process (pid=${row.pid})`);
      try {
        ctx.kill(row.pid, 'SIGKILL');
      } catch {
        // already dead
      }
    }
    ctx.dbStore.delete(targetId);
    log.info(`stop("${targetId}") — no in-memory deployment found, cleaned DB`);
    return;
  }

  log.info(`stop("${targetId}") — sending SIGTERM to process tree (pid=${entry.pid})`);

  entry.logs.clear();

  // Send SIGTERM to process tree (tree-kill handles child processes)
  try {
    ctx.kill(entry.pid, 'SIGTERM');
  } catch {
    log.info(`stop("${targetId}") — process already dead on SIGTERM`);
    ctx.deployments.delete(targetId);
    ctx.dbStore.delete(targetId);
    return;
  }

  // Wait for the process to exit
  const died = await pollUntilDead(ctx.isAlive, entry.pid, MAX_WAIT_MS, POLL_INTERVAL_MS);

  if (!died) {
    log.warn(
      `stop("${targetId}") — process did not exit after ${MAX_WAIT_MS}ms, escalating to SIGKILL`
    );
    try {
      ctx.kill(entry.pid, 'SIGKILL');
    } catch {
      // Process may have exited between check and kill
    }
  } else {
    log.info(`stop("${targetId}") — process exited gracefully`);
  }

  // Wait for the exit event to clean up the map (only if we have a ChildProcess handle)
  if (entry.child) {
    await waitForExit(entry.child, WAIT_FOR_EXIT_TIMEOUT_MS);
  }

  // Ensure cleanup
  ctx.deployments.delete(targetId);
  ctx.dbStore.delete(targetId);
}
