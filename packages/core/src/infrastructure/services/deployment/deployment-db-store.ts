/**
 * Persistence helper for the dev_servers table.
 *
 * Wraps every statement in try/catch — the table may not exist yet during
 * early bootstrap, and persistence failures must never break deployment
 * lifecycle operations (they are logged and swallowed).
 *
 * NOTE: Booting and transient (Analyzing/Installing) entries are NEVER
 * written here. Only Ready entries are persisted — see DeploymentService.
 */

import type Database from 'better-sqlite3';
import type { DeploymentState } from '@/domain/generated/output.js';
import { createDeploymentLogger } from './deployment-logger.js';
import type { DeploymentEntry } from './deployment-entry.js';
import { LogRingBuffer } from './log-ring-buffer.js';

const log = createDeploymentLogger('[DeploymentService]');

export interface DevServerRow {
  target_id: string;
  target_type: string;
  pid: number;
  state: string;
  url: string | null;
  target_path: string;
  started_at: number;
}

/**
 * Build an in-memory entry for a persisted row whose process is still alive
 * but whose ChildProcess handle we no longer own (orphan re-adoption).
 */
export function entryFromRow(row: DevServerRow): DeploymentEntry {
  return {
    pid: row.pid,
    child: null, // orphan — we don't have the ChildProcess handle
    state: row.state as DeploymentState,
    url: row.url,
    targetId: row.target_id,
    targetPath: row.target_path,
    targetType: row.target_type,
    stdoutBuffer: '',
    stderrBuffer: '',
    logs: new LogRingBuffer(),
  };
}

export class DeploymentDbStore {
  private db: Database.Database | null = null;

  setDatabase(db: Database.Database): void {
    this.db = db;
  }

  hasDatabase(): boolean {
    return this.db !== null;
  }

  upsert(entry: DeploymentEntry): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO dev_servers
         (target_id, target_type, pid, state, url, target_path, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entry.targetId,
          entry.targetType,
          entry.pid,
          entry.state,
          entry.url,
          entry.targetPath,
          Date.now()
        );
    } catch (err) {
      log.warn(`dbUpsert failed for "${entry.targetId}": ${err}`);
    }
  }

  delete(targetId: string): void {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM dev_servers WHERE target_id = ?').run(targetId);
    } catch (err) {
      log.warn(`dbDelete failed for "${targetId}": ${err}`);
    }
  }

  deleteAll(): void {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM dev_servers').run();
    } catch {
      // table might not exist yet
    }
  }

  find(targetId: string): DevServerRow | null {
    if (!this.db) return null;
    try {
      return (
        (this.db.prepare('SELECT * FROM dev_servers WHERE target_id = ?').get(targetId) as
          | DevServerRow
          | undefined) ?? null
      );
    } catch {
      return null;
    }
  }

  findAll(): DevServerRow[] {
    if (!this.db) return [];
    try {
      return this.db.prepare('SELECT * FROM dev_servers').all() as DevServerRow[];
    } catch {
      return [];
    }
  }

  /**
   * Like findAll(), but distinguishes "table not ready" (null) from
   * "no rows" ([]) — recovery logs the two cases differently.
   */
  findAllOrNull(): DevServerRow[] | null {
    if (!this.db) return null;
    try {
      const rows = this.db.prepare('SELECT * FROM dev_servers').all() as DevServerRow[];
      return rows ?? [];
    } catch {
      return null;
    }
  }
}
