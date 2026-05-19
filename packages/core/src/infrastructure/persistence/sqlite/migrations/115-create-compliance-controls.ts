/**
 * Migration 115: Create compliance_controls + finding_compliance_controls tables.
 *
 * Feature 098, phase 9 (Compliance Surface) — task-52. ComplianceControl
 * stores a single control within a compliance framework (OWASP ASVS L1/L2
 * and CWE Top 25 in MVP). Findings link to zero-or-more controls via the
 * finding_compliance_controls join table; the SARIF adapter populates
 * those links from taxa references during ingestion (FR-34).
 *
 * Regulated frameworks (SOC 2 / PCI DSS / HIPAA) are additive rows in
 * compliance_controls later — no schema change required (FR-33).
 *
 * Seeding (idempotent per NFR-18 / LESSONS.md):
 *  - OWASP ASVS L1/L2 control set covering the most-frequently-referenced
 *    rules (input validation, auth, session, crypto, output encoding,
 *    error handling, file handling, API). Identifiers (V*.*.*) come from
 *    the OWASP ASVS v4.0.3 spec.
 *  - CWE Top 25 (2023 list). Identifiers are the canonical CWE-* strings.
 *  - INSERT OR IGNORE keyed on the partial unique index
 *    (frameworkId, controlId) so re-running the migration is a no-op.
 *
 * Indexes:
 *  - UNIQUE (framework_id, control_id) — required by linkToFinding to
 *    look up the canonical control row before writing the join.
 *  - finding_compliance_controls (finding_id) — per-finding fan-out reads.
 *  - finding_compliance_controls UNIQUE (finding_id, control_id) — at most
 *    one link between a given finding and a given control.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { COMPLIANCE_CONTROL_SEED_ROWS } from './data/compliance-control-seed.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const controlTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compliance_controls'")
    .all() as { name: string }[];

  if (controlTables.length === 0) {
    db.exec(`
      CREATE TABLE compliance_controls (
        id            TEXT PRIMARY KEY,
        framework_id  TEXT NOT NULL,
        control_id    TEXT NOT NULL,
        title         TEXT NOT NULL,
        description   TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER
      )
    `);
  }

  const controlIndexes = db.pragma('index_list(compliance_controls)') as { name: string }[];
  const controlIndexNames = new Set(controlIndexes.map((i) => i.name));

  if (!controlIndexNames.has('idx_compliance_controls_framework_control_unique')) {
    db.exec(
      `CREATE UNIQUE INDEX idx_compliance_controls_framework_control_unique
       ON compliance_controls(framework_id, control_id)
       WHERE deleted_at IS NULL`
    );
  }

  const joinTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='finding_compliance_controls'"
    )
    .all() as { name: string }[];

  if (joinTables.length === 0) {
    db.exec(`
      CREATE TABLE finding_compliance_controls (
        id          TEXT PRIMARY KEY,
        finding_id  TEXT NOT NULL,
        control_id  TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      )
    `);
  }

  const joinIndexes = db.pragma('index_list(finding_compliance_controls)') as { name: string }[];
  const joinIndexNames = new Set(joinIndexes.map((i) => i.name));

  if (!joinIndexNames.has('idx_finding_compliance_controls_finding')) {
    db.exec(
      'CREATE INDEX idx_finding_compliance_controls_finding ON finding_compliance_controls(finding_id)'
    );
  }
  if (!joinIndexNames.has('idx_finding_compliance_controls_control')) {
    db.exec(
      'CREATE INDEX idx_finding_compliance_controls_control ON finding_compliance_controls(control_id)'
    );
  }
  if (!joinIndexNames.has('idx_finding_compliance_controls_unique')) {
    db.exec(
      `CREATE UNIQUE INDEX idx_finding_compliance_controls_unique
       ON finding_compliance_controls(finding_id, control_id)`
    );
  }

  const seedStmt = db.prepare(
    `INSERT OR IGNORE INTO compliance_controls
     (id, framework_id, control_id, title, description, created_at, updated_at, deleted_at)
     VALUES (@id, @framework_id, @control_id, @title, @description, @created_at, @updated_at, NULL)`
  );
  const seedTx = db.transaction((rows: typeof COMPLIANCE_CONTROL_SEED_ROWS) => {
    const now = Date.now();
    for (const row of rows) {
      seedStmt.run({
        id: row.id,
        framework_id: row.frameworkId,
        control_id: row.controlId,
        title: row.title,
        description: row.description,
        created_at: now,
        updated_at: now,
      });
    }
  });
  seedTx(COMPLIANCE_CONTROL_SEED_ROWS);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS finding_compliance_controls');
  db.exec('DROP TABLE IF EXISTS compliance_controls');
}
