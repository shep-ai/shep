/**
 * Migration 121: Create security_events table.
 *
 * Creates the security_events table for persisting security audit events
 * (policy violations, approval decisions, enforcement outcomes).
 *
 * Columns:
 *  - id                 TEXT PRIMARY KEY
 *  - repository_path    TEXT NOT NULL
 *  - feature_id         TEXT (nullable)
 *  - severity           TEXT NOT NULL
 *  - category           TEXT NOT NULL
 *  - disposition        TEXT NOT NULL
 *  - actor              TEXT (nullable)
 *  - message            TEXT (nullable)
 *  - remediation_summary TEXT (nullable)
 *  - created_at         TEXT NOT NULL
 *
 * Indexes:
 *  - idx_security_events_repo_created  ON (repository_path, created_at)
 *  - idx_security_events_feature       ON (feature_id)
 *
 * Migration is idempotent: uses IF NOT EXISTS on CREATE TABLE and indexes.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      repository_path TEXT NOT NULL,
      feature_id TEXT,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      disposition TEXT NOT NULL,
      actor TEXT,
      message TEXT,
      remediation_summary TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_security_events_repo_created
    ON security_events(repository_path, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_security_events_feature
    ON security_events(feature_id)
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // Additive-only migration — table is new and ignored by older code.
  // No-op per LESSONS.md backward compatibility rules.
  void db;
}
