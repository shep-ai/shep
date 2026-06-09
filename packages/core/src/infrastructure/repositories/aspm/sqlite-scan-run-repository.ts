/**
 * SQLite ScanRun Repository (Phase 11, task-70). Backed by scan_runs
 * (migration 118). Persists the entire stages array per row on every
 * save — partial updates would require a per-stage table which is not
 * worth the join cost on the SSE read path.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { ScanRun } from '../../../domain/generated/output.js';
import type { IScanRunRepository } from '../../../application/ports/output/repositories/scan-run-repository.interface.js';
import {
  fromDatabase,
  toDatabase,
  type ScanRunRow,
} from '../../persistence/sqlite/mappers/scan-run-mapper.js';

@injectable()
export class SQLiteScanRunRepository implements IScanRunRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async save(run: ScanRun): Promise<void> {
    const row = toDatabase(run);
    this.db
      .prepare(
        `INSERT INTO scan_runs (
           id, application_id, triggered_by, status, started_at, finished_at,
           stages_json, findings_count, created_at, updated_at
         ) VALUES (
           @id, @application_id, @triggered_by, @status, @started_at, @finished_at,
           @stages_json, @findings_count, @created_at, @updated_at
         )
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           finished_at = excluded.finished_at,
           stages_json = excluded.stages_json,
           findings_count = excluded.findings_count,
           updated_at = excluded.updated_at`
      )
      .run(row);
  }

  async findById(id: string): Promise<ScanRun | null> {
    const row = this.db.prepare('SELECT * FROM scan_runs WHERE id = ?').get(id) as
      | ScanRunRow
      | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listLatestForApplication(applicationId: string, limit: number): Promise<ScanRun[]> {
    const rows = this.db
      .prepare('SELECT * FROM scan_runs WHERE application_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(applicationId, Math.max(1, Math.floor(limit))) as ScanRunRow[];
    return rows.map(fromDatabase);
  }

  async findLatestForApplication(applicationId: string): Promise<ScanRun | null> {
    const row = this.db
      .prepare('SELECT * FROM scan_runs WHERE application_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(applicationId) as ScanRunRow | undefined;
    return row ? fromDatabase(row) : null;
  }
}
