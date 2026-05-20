/**
 * Migration 118: Create scan_runs table.
 *
 * Feature 098 Phase 11 (Native Scanning). Append-only history of every scan
 * invocation. Stages live as JSON because they are emitted on the SSE stream
 * as a whole per delta; a separate scan_stages table would cost a join on
 * every event for no read benefit.
 *
 * Idempotent: table creation guarded by sqlite_master lookup, indexes
 * guarded by pragma index_list. Re-running the migration is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_runs'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE scan_runs (
        id              TEXT PRIMARY KEY,
        application_id  TEXT NOT NULL,
        triggered_by    TEXT NOT NULL,
        status          TEXT NOT NULL,
        started_at      INTEGER NOT NULL,
        finished_at     INTEGER,
        stages_json     TEXT NOT NULL,
        findings_count  INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(scan_runs)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_scan_runs_application_started_at')) {
    db.exec(
      'CREATE INDEX idx_scan_runs_application_started_at ON scan_runs(application_id, started_at DESC)'
    );
  }
  if (!indexNames.has('idx_scan_runs_status')) {
    db.exec('CREATE INDEX idx_scan_runs_status ON scan_runs(status)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite drop-column is unsupported pre-3.35.0; whole-table drop is safe
  // for a brand-new table that no other ASPM artifact references.
  db.exec('DROP TABLE IF EXISTS scan_runs');
}
