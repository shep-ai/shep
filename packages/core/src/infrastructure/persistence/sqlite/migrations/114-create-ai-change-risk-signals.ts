/**
 * Migration 114: Create ai_change_risk_signals table.
 *
 * Feature 098, phase 8 (task-49). AiChangeRiskSignal is Shep's
 * differentiating triage record for risk introduced by AI-generated
 * changes (research decision 6, FR-29). Modelled as a distinct entity
 * (not a tagged SecurityFinding) so the unified Findings backlog keeps
 * clean SLA math and exception stats; confirmed signals graduate to a
 * SecurityFinding via graduate-ai-signal-to-finding (FR-31).
 *
 * Schema follows the entity in
 * tsp/domain/entities/aspm/ai-change-risk-signal.tsp — applicationId,
 * agentSessionId, signalType, severity, summary, evidence (JSON), state,
 * ownerId, graduatedFindingId, discoveredAt, resolvedAt — plus the
 * SoftDeletableEntity audit columns (created_at / updated_at /
 * deleted_at) shared with the rest of ASPM.
 *
 * Indexes (NFR-7):
 *   - (application_id, state)         — per-application queue rollups.
 *   - (state, discovered_at)          — global queue, newest first.
 *   - (agent_session_id)              — drill-back to originating run.
 *   - (graduated_finding_id) UNIQUE   — at most one signal can graduate
 *                                       into a given finding.
 *
 * Idempotent per LESSONS.md / NFR-18 — CREATE TABLE IF NOT EXISTS +
 * pragma index_list guards. Re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_change_risk_signals'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE ai_change_risk_signals (
        id                    TEXT PRIMARY KEY,
        application_id        TEXT NOT NULL,
        agent_session_id      TEXT,
        signal_type           TEXT NOT NULL,
        severity              TEXT NOT NULL,
        summary               TEXT NOT NULL,
        evidence              TEXT,
        state                 TEXT NOT NULL,
        owner_id              TEXT,
        graduated_finding_id  TEXT,
        discovered_at         INTEGER NOT NULL,
        resolved_at           INTEGER,
        created_at            INTEGER NOT NULL,
        updated_at            INTEGER NOT NULL,
        deleted_at            INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(ai_change_risk_signals)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_ai_signals_application_state')) {
    db.exec(
      'CREATE INDEX idx_ai_signals_application_state ON ai_change_risk_signals(application_id, state) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_ai_signals_state_discovered_at')) {
    db.exec(
      'CREATE INDEX idx_ai_signals_state_discovered_at ON ai_change_risk_signals(state, discovered_at DESC) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_ai_signals_agent_session')) {
    db.exec(
      'CREATE INDEX idx_ai_signals_agent_session ON ai_change_risk_signals(agent_session_id) WHERE agent_session_id IS NOT NULL AND deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_ai_signals_graduated_finding_unique')) {
    db.exec(
      `CREATE UNIQUE INDEX idx_ai_signals_graduated_finding_unique
       ON ai_change_risk_signals(graduated_finding_id)
       WHERE graduated_finding_id IS NOT NULL AND deleted_at IS NULL`
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS ai_change_risk_signals');
}
