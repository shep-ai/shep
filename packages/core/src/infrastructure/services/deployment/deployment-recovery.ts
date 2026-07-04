/**
 * Startup recovery for persisted dev servers.
 *
 * Reconciles the dev_servers table with actual process state:
 * 1. Alive + Ready (has URL) → re-adopt, then validate URL asynchronously
 * 2. Alive + Booting (no URL) → leave running, drop the row (can't re-attach)
 * 3. Dead → re-spawn if the target directory still exists
 *
 * Zombies (alive but not serving) found by the async URL health check are
 * killed and re-spawned. All re-spawns are wrapped in try/catch so one
 * failure doesn't block others.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { DeploymentState } from '@/domain/generated/output.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { type DeploymentEntry } from './deployment-entry.js';
import { entryFromRow, type DevServerRow } from './deployment-db-store.js';
import type { DeploymentContext } from './deployment-context.js';

const log = createDeploymentLogger('[DeploymentService]');
const PROBE_TIMEOUT_MS = 2000;

export interface DeploymentRecoveryContext extends DeploymentContext {
  start(targetId: string, targetPath: string, targetType: string): void;
}

export class DeploymentRecovery {
  constructor(private readonly ctx: DeploymentRecoveryContext) {}

  /** Recover dev servers from the database on startup. */
  recoverAll(): void {
    if (!this.ctx.dbStore.hasDatabase()) return;

    // Child dev servers spawned by DeploymentService share the same global DB.
    // Skip recovery to avoid killing processes owned by the parent instance.
    if (process.env.SHEP_SKIP_RECOVERY) {
      log.info('SHEP_SKIP_RECOVERY set — skipping dev server recovery');
      return;
    }

    const rows = this.ctx.dbStore.findAllOrNull();
    if (rows === null) {
      log.info('dev_servers table not ready — skipping recovery');
      return;
    }

    if (rows.length === 0) {
      log.info('No dev servers to recover from database');
      return;
    }

    log.info(`Recovering ${rows.length} dev server(s) from database`);

    for (const row of rows) {
      this.recoverRow(row);
    }
  }

  private recoverRow(row: DevServerRow): void {
    const alive = this.ctx.isAlive(row.pid);
    const hasUrl = row.state === DeploymentState.Ready && row.url;

    if (alive && hasUrl) {
      // Strategy 1: Process alive and Ready — re-adopt, then validate URL async
      log.info(`Recovered "${row.target_id}" (pid=${row.pid}, state=${row.state}, url=${row.url})`);
      const entry = entryFromRow(row);
      this.ctx.deployments.set(row.target_id, entry);
      // Fire-and-forget: validate URL is actually responding, kill zombie if not
      this.validateAndRespawn(entry);
      return;
    }

    if (alive) {
      // Strategy 2: Process alive but stuck in Booting — leave it running.
      // We can't re-attach stdout so we can't detect when it becomes Ready,
      // but killing it would be destructive (another process on the same
      // shared DB may have just spawned it). The user can restart manually.
      log.info(
        `Orphan "${row.target_id}" (pid=${row.pid}) stuck in ${row.state} — leaving alive (cannot re-attach)`
      );
      this.ctx.dbStore.delete(row.target_id);
      return;
    }

    // Strategy 3: Dead process — re-spawn if target directory still exists
    log.info(`Dev server "${row.target_id}" (pid=${row.pid}) is dead — will re-spawn`);
    this.ctx.dbStore.delete(row.target_id);
    this.respawn(row.target_id, row.target_path, row.target_type);
  }

  /** Re-spawn a dev server if its target directory still has a package.json. */
  private respawn(targetId: string, targetPath: string, targetType: string): void {
    if (!existsSync(join(targetPath, 'package.json'))) {
      log.warn(`Skipping re-spawn for "${targetId}" — no package.json at "${targetPath}"`);
      return;
    }

    try {
      log.info(`Re-spawning dev server for "${targetId}" at "${targetPath}"`);
      this.ctx.start(targetId, targetPath, targetType);
    } catch (err) {
      log.error(`Failed to re-spawn "${targetId}": ${err}`);
    }
  }

  /**
   * Async health check for a recovered entry. Probes the URL port via TCP.
   * If the port is not responding (zombie process), kills and re-spawns.
   * Fire-and-forget — errors are logged, never thrown.
   */
  async validateAndRespawn(entry: DeploymentEntry): Promise<void> {
    if (!entry.url) return;

    const responding = await this.probePort(entry.url);
    if (responding) {
      log.info(`[${entry.targetId}] URL health check passed — "${entry.url}" is responding`);
      return;
    }

    log.warn(
      `[${entry.targetId}] URL health check FAILED — "${entry.url}" not responding, killing zombie (pid=${entry.pid})`
    );

    // Kill the zombie
    try {
      this.ctx.kill(entry.pid, 'SIGKILL');
    } catch {
      // already dead
    }
    this.ctx.deployments.delete(entry.targetId);
    this.ctx.dbStore.delete(entry.targetId);

    this.respawn(entry.targetId, entry.targetPath, entry.targetType);
  }

  /**
   * TCP connect probe to check if a URL's port is accepting connections.
   * Returns true if the port responds within the probe timeout, false otherwise.
   */
  private probePort(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const port = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'), 10);
        const socket = net.createConnection({ host: parsed.hostname, port });
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, PROBE_TIMEOUT_MS);
        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }
}
