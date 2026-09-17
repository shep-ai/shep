/**
 * Migration 142: Add the parallel-feature cap to the settings table.
 *
 * - workflow_max_parallel_features (INTEGER DEFAULT 0): maximum number of
 *   features that may have a live agent at the same time.
 *
 * The default of 0 means unlimited, so existing installations keep the exact
 * behaviour they had before the cap existed — a non-zero default would silently
 * start queueing features on upgrade with no error to explain it.
 *
 * Guarded by table_info so re-running on an already-migrated database is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('workflow_max_parallel_features')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN workflow_max_parallel_features INTEGER NOT NULL DEFAULT 0'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
