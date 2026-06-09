/**
 * Migration 113: Create remediation_campaigns table.
 *
 * Feature 098, phase 6 (task-37). A RemediationCampaign carries a
 * serialized FindingFilter target query plus campaign metadata (owner,
 * due date, status, description). Campaign progress is computed at read
 * time by re-running the targetQuery — no explicit Finding↔Campaign join
 * table (research decision 9, FR-17).
 *
 * The audit log column holds an append-only JSON-encoded array of state
 * transitions, mirroring the risk_exceptions audit pattern (NFR-12).
 *
 * Indexes (NFR-7):
 *   - (status) — fast lookup of active vs. closed campaigns.
 *   - (owner_id, status) — owner-scoped board view.
 *   - (due_date) — sorting + "overdue" tile.
 *
 * Idempotent per LESSONS.md / NFR-18 — CREATE TABLE IF NOT EXISTS +
 * pragma index_list guards.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remediation_campaigns'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE remediation_campaigns (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        description       TEXT NOT NULL,
        target_query_json TEXT NOT NULL,
        status            TEXT NOT NULL,
        owner_id          TEXT,
        due_date          INTEGER,
        closed_at         INTEGER,
        audit_log         TEXT NOT NULL,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        deleted_at        INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(remediation_campaigns)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_remediation_campaigns_status')) {
    db.exec(
      'CREATE INDEX idx_remediation_campaigns_status ON remediation_campaigns(status) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_remediation_campaigns_owner_status')) {
    db.exec(
      'CREATE INDEX idx_remediation_campaigns_owner_status ON remediation_campaigns(owner_id, status) WHERE owner_id IS NOT NULL AND deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_remediation_campaigns_due_date')) {
    db.exec(
      'CREATE INDEX idx_remediation_campaigns_due_date ON remediation_campaigns(due_date) WHERE due_date IS NOT NULL AND deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS remediation_campaigns');
}
