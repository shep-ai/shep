/**
 * Status reads over the deployment registry.
 *
 * Both reads validate PID liveness and clean up dead entries (in-memory and
 * DB) as a side effect, and re-adopt live DB rows not yet in memory (e.g.
 * after a hook re-mount). Transient (Analyzing/Installing) entries have no
 * process by design — they are surfaced as-is and never cleaned up here.
 */

import type {
  DeploymentStatus,
  DeploymentStatusEntry,
} from '@/application/ports/output/services/deployment-service.interface.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { isTransientEntry } from './deployment-entry.js';
import { entryFromRow } from './deployment-db-store.js';
import type { DeploymentContext } from './deployment-context.js';

const log = createDeploymentLogger('[DeploymentService]');

/**
 * Get the current deployment status for a target.
 * Checks the in-memory Map first, then falls back to the DB for recovered
 * deployments.
 */
export function getDeploymentStatus(
  ctx: DeploymentContext,
  targetId: string
): DeploymentStatus | null {
  const entry = ctx.deployments.get(targetId);
  if (entry) {
    // Transient entries have no process — nothing to validate.
    if (isTransientEntry(entry)) {
      return { state: entry.state, url: entry.url };
    }
    // Validate the process is still alive (handles orphan crashes)
    if (!ctx.isAlive(entry.pid)) {
      log.info(`getStatus("${targetId}") — pid=${entry.pid} is dead, cleaning up`);
      ctx.deployments.delete(targetId);
      ctx.dbStore.delete(targetId);
      return null;
    }
    log.debug(
      `getStatus("${targetId}") — state=${entry.state}, url=${entry.url}, pid=${entry.pid}`
    );
    return { state: entry.state, url: entry.url };
  }

  // Check DB for entries not yet in memory (e.g., after hook re-mount)
  const row = ctx.dbStore.find(targetId);
  if (row) {
    if (ctx.isAlive(row.pid)) {
      // Re-adopt into memory
      const recovered = entryFromRow(row);
      ctx.deployments.set(targetId, recovered);
      return { state: recovered.state, url: recovered.url };
    }
    // Dead — clean up
    ctx.dbStore.delete(targetId);
  }

  log.debug(`getStatus("${targetId}") — no deployment found`);
  return null;
}

/**
 * List all tracked deployments with live processes (plus transient
 * pre-spawn entries). Merges in-memory entries with any DB rows not yet
 * re-adopted.
 */
export function listAllDeployments(ctx: DeploymentContext): DeploymentStatusEntry[] {
  const entries: DeploymentStatusEntry[] = [];
  const seen = new Set<string>();

  // 1) In-memory entries (validated for liveness; transient entries have
  //    no process and are surfaced as-is)
  for (const [targetId, entry] of ctx.deployments) {
    if (!isTransientEntry(entry) && !ctx.isAlive(entry.pid)) {
      log.info(`listAll — pid=${entry.pid} for "${targetId}" is dead, cleaning up`);
      ctx.deployments.delete(targetId);
      ctx.dbStore.delete(targetId);
      continue;
    }
    seen.add(targetId);
    entries.push({
      targetId,
      targetType: entry.targetType,
      state: entry.state,
      url: entry.url,
    });
  }

  // 2) DB rows not yet in memory — re-adopt live ones, drop dead
  const rows = ctx.dbStore.findAll();
  for (const row of rows) {
    if (seen.has(row.target_id)) continue;
    if (!ctx.isAlive(row.pid)) {
      ctx.dbStore.delete(row.target_id);
      continue;
    }
    const recovered = entryFromRow(row);
    ctx.deployments.set(row.target_id, recovered);
    entries.push({
      targetId: row.target_id,
      targetType: row.target_type,
      state: recovered.state,
      url: recovered.url,
    });
  }

  return entries;
}
