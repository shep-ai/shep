/**
 * Migration 120: Add security settings columns to the settings table.
 *
 * Adds three columns for supply-chain security configuration:
 *  - security_mode          TEXT NOT NULL DEFAULT 'Advisory'
 *  - security_last_evaluation_at  TEXT (nullable)
 *  - security_policy_source       TEXT (nullable)
 *
 * These columns store the effective security mode, last evaluation
 * timestamp, and policy source origin for the SecurityConfig model.
 *
 * Migration is idempotent: checks column existence before ALTER.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existingNames = new Set(columns.map((c) => c.name));

  if (!existingNames.has('security_mode')) {
    db.exec("ALTER TABLE settings ADD COLUMN security_mode TEXT NOT NULL DEFAULT 'Advisory'");
  }

  if (!existingNames.has('security_last_evaluation_at')) {
    db.exec('ALTER TABLE settings ADD COLUMN security_last_evaluation_at TEXT');
  }

  if (!existingNames.has('security_policy_source')) {
    db.exec('ALTER TABLE settings ADD COLUMN security_policy_source TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // Additive-only migration — columns are nullable/defaulted and ignored
  // by older code. No-op per LESSONS.md backward compatibility rules.
  void db;
}
