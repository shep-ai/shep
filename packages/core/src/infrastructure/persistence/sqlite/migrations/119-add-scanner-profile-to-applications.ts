/**
 * Migration 119: Add scanner_profile_json + last_scanned_at to applications.
 *
 * Feature 098 Phase 11. scanner_profile_json holds the embedded ScannerProfile
 * value object as JSON ('{}' on existing rows — the domain layer treats this
 * as "use defaults: every stage enabled, no excludes, autoRescan on").
 * last_scanned_at powers the "Last scanned" dashboard tile and the nightly
 * scheduler's 24h gate.
 *
 * Idempotent per LESSONS.md: each ADD COLUMN is guarded by pragma table_info.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const NEW_COLUMNS: { name: string; ddl: string }[] = [
  {
    name: 'scanner_profile_json',
    ddl: "ALTER TABLE applications ADD COLUMN scanner_profile_json TEXT NOT NULL DEFAULT '{}'",
  },
  {
    name: 'last_scanned_at',
    ddl: 'ALTER TABLE applications ADD COLUMN last_scanned_at INTEGER',
  },
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
  // SQLite < 3.35.0 cannot DROP COLUMN. The added columns are nullable / have
  // safe defaults, so leaving them in place is harmless if the feature is
  // rolled back at the application layer.
}
