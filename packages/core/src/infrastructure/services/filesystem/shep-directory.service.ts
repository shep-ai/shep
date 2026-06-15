/**
 * Shep Directory Service
 *
 * Manages the ~/.shep/ directory for global settings and data storage.
 * Ensures directory exists with correct permissions before database operations.
 *
 * Supports SHEP_HOME env var for test isolation (overrides default ~/.shep/).
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Resolves the Shep home directory.
 * Respects SHEP_HOME env var for test isolation, falls back to ~/.shep/
 */
function resolveShepHomeDir(): string {
  return process.env.SHEP_HOME ?? join(homedir(), '.shep');
}

/**
 * Gets the path to the Shep home directory.
 * Uses SHEP_HOME env var if set, otherwise ~/.shep/
 *
 * @returns Path to shep home directory
 */
export function getShepHomeDir(): string {
  return resolveShepHomeDir();
}

/**
 * Gets the path to the SQLite database file.
 *
 * @returns Path to the database file
 */
export function getShepDbPath(): string {
  return join(resolveShepHomeDir(), 'data');
}

/**
 * Gets the directory where agent worker log files are written.
 * Derived from SHEP_HOME so multiple instances keep separate logs.
 *
 * @returns Path to the logs directory ($SHEP_HOME/logs)
 */
export function getShepLogsDir(): string {
  return join(resolveShepHomeDir(), 'logs');
}

/**
 * Gets the directory where LangGraph checkpoint databases are stored.
 * Derived from SHEP_HOME so multiple instances keep separate agent state.
 *
 * @returns Path to the checkpoints directory ($SHEP_HOME/checkpoints)
 */
export function getShepCheckpointsDir(): string {
  return join(resolveShepHomeDir(), 'checkpoints');
}

/**
 * Gets the directory where per-cluster kubeconfigs are stored.
 * Derived from SHEP_HOME so multiple instances keep separate cluster state.
 *
 * @returns Path to the clusters directory ($SHEP_HOME/clusters)
 */
export function getShepClustersDir(): string {
  return join(resolveShepHomeDir(), 'clusters');
}

/**
 * Gets the path to the daemon state file.
 * Uses SHEP_HOME env var if set (for test isolation), otherwise ~/.shep/daemon.json
 *
 * @returns Path to daemon.json
 */
export function getDaemonStatePath(): string {
  return join(resolveShepHomeDir(), 'daemon.json');
}

/**
 * Gets the path to the daemon log file.
 * Uses SHEP_HOME env var if set (for test isolation), otherwise ~/.shep/daemon.log
 *
 * @returns Path to daemon.log
 */
export function getDaemonLogPath(): string {
  return join(resolveShepHomeDir(), 'daemon.log');
}

/**
 * Ensures the shep home directory exists with correct permissions.
 * Creates the directory if it doesn't exist.
 * Safe to call multiple times (idempotent).
 *
 * Permissions: 700 (rwx------) - only owner can read/write/execute
 *
 * @throws Error if directory cannot be created (permissions, disk space, etc.)
 */
export async function ensureShepDirectory(): Promise<void> {
  const shepDir = resolveShepHomeDir();

  if (existsSync(shepDir)) {
    return;
  }

  try {
    await mkdir(shepDir, {
      recursive: true,
      mode: 0o700,
    });
  } catch (error) {
    throw new Error(
      `Failed to create Shep directory at ${shepDir}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
