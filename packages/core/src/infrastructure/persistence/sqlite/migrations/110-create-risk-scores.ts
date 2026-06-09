/**
 * Migration 110: Create risk_scores table.
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-24. Append-only
 * history of composite risk scores for each SecurityFinding (research decision
 * "Where should the RiskScore live"). Each compute writes a new row; the
 * security_findings.current_risk_score_id pointer keeps "latest score"
 * lookups O(1) while the full history feeds the risk-trend chart (FR-25)
 * and audit.
 *
 * The current_risk_score_id column on security_findings was already added
 * in migration 108; it is nullable so this migration only needs to create
 * the new table + indexes.
 *
 * Indexes (NFR-7 / NFR-8 — dashboard + ranking latency):
 *  - (finding_id, computed_at DESC) — fast lookup of latest score + history
 *    for a single finding.
 *  - (total DESC) — supports the `rank-findings` ORDER BY total DESC join.
 *
 * Idempotent per LESSONS.md / NFR-18 — CREATE TABLE IF NOT EXISTS plus
 * pragma index_list guards. Re-running the migration runner is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_scores'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE risk_scores (
        id                              TEXT PRIMARY KEY,
        finding_id                      TEXT NOT NULL,
        total                           INTEGER NOT NULL,
        cvss_contribution               REAL NOT NULL,
        epss_contribution               REAL NOT NULL,
        kev_contribution                REAL NOT NULL,
        exposure_contribution           REAL NOT NULL,
        criticality_contribution        REAL NOT NULL,
        data_classification_contribution REAL NOT NULL,
        computed_at                     INTEGER NOT NULL,
        inputs_hash                     TEXT NOT NULL,
        created_at                      INTEGER NOT NULL,
        updated_at                      INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(risk_scores)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_risk_scores_finding_id_computed_at')) {
    db.exec(
      'CREATE INDEX idx_risk_scores_finding_id_computed_at ON risk_scores(finding_id, computed_at DESC)'
    );
  }
  if (!indexNames.has('idx_risk_scores_total_desc')) {
    db.exec('CREATE INDEX idx_risk_scores_total_desc ON risk_scores(total DESC)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS risk_scores');
}
