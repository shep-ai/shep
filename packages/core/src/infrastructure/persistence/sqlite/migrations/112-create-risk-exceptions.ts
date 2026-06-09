/**
 * Migration 112: Create risk_exceptions table.
 *
 * Feature 098, phase 6 (task-34). A RiskException temporarily masks a
 * SecurityFinding from posture rollups and SLA math (research decision 8,
 * FR-22). Self-declared with a typed reason taxonomy, free-form
 * justification, mandatory expiry, and an immutable per-row audit log
 * (NFR-12). Expired exceptions are read-side computed back to "no longer
 * masking" via the effective-finding-state pure function — the underlying
 * row is preserved for audit.
 *
 * Indexes (NFR-7):
 *   - (finding_id, status) — fast lookup of the active exception for a
 *     finding when computing effective state and SLA bands.
 *   - (expires_at, status) — drives the "expiring within N days" tile and
 *     the list-expiring-exceptions use case.
 *
 * Idempotent per LESSONS.md / NFR-18 — CREATE TABLE IF NOT EXISTS +
 * pragma index_list guards. Re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_exceptions'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE risk_exceptions (
        id              TEXT PRIMARY KEY,
        finding_id      TEXT NOT NULL,
        reason          TEXT NOT NULL,
        justification   TEXT NOT NULL,
        declared_by     TEXT NOT NULL,
        declared_at     INTEGER NOT NULL,
        expires_at      INTEGER NOT NULL,
        status          TEXT NOT NULL,
        audit_log       TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(risk_exceptions)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_risk_exceptions_finding_status')) {
    db.exec(
      'CREATE INDEX idx_risk_exceptions_finding_status ON risk_exceptions(finding_id, status) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_risk_exceptions_expires_at_status')) {
    db.exec(
      'CREATE INDEX idx_risk_exceptions_expires_at_status ON risk_exceptions(expires_at, status) WHERE deleted_at IS NULL'
    );
  }

  // Enforce at-most-one Active exception per finding via partial unique
  // index. Matches the use-case guard against re-declaring while one is
  // already in flight (task-36).
  if (!indexNames.has('idx_risk_exceptions_finding_active_unique')) {
    db.exec(
      `CREATE UNIQUE INDEX idx_risk_exceptions_finding_active_unique
       ON risk_exceptions(finding_id)
       WHERE status = 'Active' AND deleted_at IS NULL`
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS risk_exceptions');
}
