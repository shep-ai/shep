/**
 * Migration 108: Create security_findings table.
 *
 * Feature 098, phase 3 (SecurityFinding Entity + SARIF Ingestion). Unified
 * finding row produced by ingestion adapters across every ASPM domain
 * (research decision 3, FR-9). Soft-deletable for audit (NFR-12).
 *
 * Dedup key (FR-8): (application_id, finding_domain, rule_id, location_path,
 * location_line, cve_id) — enforced by a partial unique index that ignores
 * soft-deleted rows so a re-opened finding can land alongside its history.
 *
 * Indexes (NFR-7 / NFR-8 — dashboard + list latency on 50k rows):
 *  - (application_id, canonical_severity, state) — posture rollups + table sort.
 *  - (cve_id) — KEV/EPSS enrichment lookups during scoring.
 *  - (owner_id, state) — owner-scoped backlog views.
 *  - (discovered_at) — SLA computations + trend charts.
 *
 * workspace_id is nullable today (single-tenant) but reserved for the future
 * multi-workspace migration (research decision 13).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_findings'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE security_findings (
        id                      TEXT PRIMARY KEY,
        workspace_id            TEXT,
        application_id          TEXT NOT NULL,
        service_id              TEXT,
        api_asset_id            TEXT,
        cloud_environment_id    TEXT,
        finding_domain          TEXT NOT NULL,
        rule_id                 TEXT NOT NULL,
        title                   TEXT NOT NULL,
        description             TEXT NOT NULL,
        location_path           TEXT,
        location_line           INTEGER,
        scanner_raw             TEXT,
        scanner_raw_hash        TEXT,
        raw_severity            TEXT NOT NULL,
        canonical_severity      TEXT NOT NULL,
        cve_id                  TEXT,
        cwe_id                  TEXT,
        owasp_asvs_control_id   TEXT,
        owner_id                TEXT,
        state                   TEXT NOT NULL,
        current_risk_score_id   TEXT,
        work_item_id            TEXT,
        source                  TEXT NOT NULL,
        discovered_at           INTEGER NOT NULL,
        last_seen_at            INTEGER NOT NULL,
        first_fixed_at          INTEGER,
        created_at              INTEGER NOT NULL,
        updated_at              INTEGER NOT NULL,
        deleted_at              INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(security_findings)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_security_findings_app_severity_state')) {
    db.exec(
      'CREATE INDEX idx_security_findings_app_severity_state ON security_findings(application_id, canonical_severity, state) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_security_findings_cve_id')) {
    db.exec(
      'CREATE INDEX idx_security_findings_cve_id ON security_findings(cve_id) WHERE cve_id IS NOT NULL AND deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_security_findings_owner_state')) {
    db.exec(
      'CREATE INDEX idx_security_findings_owner_state ON security_findings(owner_id, state) WHERE owner_id IS NOT NULL AND deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_security_findings_discovered_at')) {
    db.exec(
      'CREATE INDEX idx_security_findings_discovered_at ON security_findings(discovered_at) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_security_findings_dedup_unique')) {
    // Partial unique index enforces the dedup key (FR-8) on live rows only.
    db.exec(
      `CREATE UNIQUE INDEX idx_security_findings_dedup_unique
       ON security_findings(
         application_id,
         finding_domain,
         rule_id,
         COALESCE(location_path, ''),
         COALESCE(location_line, -1),
         COALESCE(cve_id, '')
       )
       WHERE deleted_at IS NULL`
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS security_findings');
}
