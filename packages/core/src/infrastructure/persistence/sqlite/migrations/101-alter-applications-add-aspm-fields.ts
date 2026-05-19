/**
 * Migration 101: Add ASPM context columns to the applications table.
 *
 * Feature 098, phase 2 (Asset & Ownership Model). Application is the canonical
 * ASPM asset anchor (research decision 1); these optional columns let posture
 * rollups and the risk-score composite see business criticality, network
 * exposure, data sensitivity, and business-unit grouping per application.
 *
 * Idempotent: each ADD COLUMN is guarded by a pragma table_info check, so
 * re-running the migration is a no-op (per LESSONS.md and NFR-18). Defaults
 * are absent (NULL) on existing rows; the domain layer interprets NULL as
 * "Unknown" and weights it accordingly in the scoring function.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const NEW_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'criticality', ddl: 'ALTER TABLE applications ADD COLUMN criticality TEXT' },
  { name: 'exposure', ddl: 'ALTER TABLE applications ADD COLUMN exposure TEXT' },
  {
    name: 'data_classification',
    ddl: 'ALTER TABLE applications ADD COLUMN data_classification TEXT',
  },
  { name: 'business_unit', ddl: 'ALTER TABLE applications ADD COLUMN business_unit TEXT' },
];

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(applications)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));
  for (const { name, ddl } of NEW_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(ddl);
    }
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0; leave columns in place.
  // The columns are nullable and unused if the ASPM feature is rolled back at
  // the application layer, so leaving them is harmless.
}
