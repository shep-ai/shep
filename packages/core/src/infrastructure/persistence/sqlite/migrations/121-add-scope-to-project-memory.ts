/**
 * Migration 121: Add `scope` to project_memory (102-shep-brain — cross-project).
 *
 * Adds a memory-reach column so an entry can apply to its own project
 * (`Project`, the default) or across every project in the organization
 * (`Organization`). Organization-scoped entries are injected into every
 * project's agents in addition to that project's own memory.
 *
 * Existing rows backfill to 'Project' via the column default, preserving the
 * original per-project behaviour.
 *
 * Idempotent per LESSONS.md: the ADD COLUMN is guarded by pragma table_info.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(project_memory)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));
  if (!existing.has('scope')) {
    db.exec("ALTER TABLE project_memory ADD COLUMN scope TEXT NOT NULL DEFAULT 'Project'");
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // SQLite < 3.35.0 cannot DROP COLUMN. The column has a safe default, so
  // leaving it in place is harmless if the feature is rolled back.
}
