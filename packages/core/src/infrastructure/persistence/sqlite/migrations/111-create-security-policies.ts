/**
 * Migration 111: Create security_policies + seed default policy.
 *
 * Feature 098, phase 6 (SLA, Remediation Campaigns & Risk Exceptions),
 * task-31. SecurityPolicy holds the workspace-wide SLA windows per canonical
 * severity (FR-19, defaults CISA BOD 22-01 style: Critical=7, High=30,
 * Medium=90, Low=180) plus the ingestion safety limit (NFR-14 max document
 * size, default 100 MiB).
 *
 * SLA windows are persisted as four discrete day-count columns
 * (sla_critical_days / sla_high_days / sla_medium_days / sla_low_days) for
 * flat indexability — the mapper materializes them into the SLAWindow[]
 * value-object shape consumed by the pure-domain SLA computation.
 *
 * Idempotent per LESSONS.md / NFR-18 — CREATE TABLE IF NOT EXISTS, pragma
 * index_list guards, and an existence check on the default policy name
 * before inserting. Re-running the migration runner is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export const DEFAULT_SECURITY_POLICY_NAME = 'Default';

// CISA BOD 22-01-style defaults (research decision 5, FR-19). Exported so
// the system clock + policy mapper can reference the same constants.
export const DEFAULT_SLA_CRITICAL_DAYS = 7;
export const DEFAULT_SLA_HIGH_DAYS = 30;
export const DEFAULT_SLA_MEDIUM_DAYS = 90;
export const DEFAULT_SLA_LOW_DAYS = 180;

// 100 MiB (NFR-14). Configurable on the active SecurityPolicy.
export const DEFAULT_INGEST_MAX_BYTES = 100 * 1024 * 1024;

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_policies'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE security_policies (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        is_active           INTEGER NOT NULL DEFAULT 0,
        sla_critical_days   INTEGER NOT NULL,
        sla_high_days       INTEGER NOT NULL,
        sla_medium_days     INTEGER NOT NULL,
        sla_low_days        INTEGER NOT NULL,
        ingestion_max_bytes INTEGER NOT NULL,
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL,
        deleted_at          INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(security_policies)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  // Enforce at most one active policy at a time (research decision 5 — one
  // active policy per workspace in MVP). Partial unique index on (is_active=1)
  // — multiple inactive policies are allowed.
  if (!indexNames.has('idx_security_policies_active_unique')) {
    db.exec(
      `CREATE UNIQUE INDEX idx_security_policies_active_unique
       ON security_policies(is_active)
       WHERE is_active = 1 AND deleted_at IS NULL`
    );
  }

  // Unique name lookup — also lets us idempotently re-seed by name.
  if (!indexNames.has('idx_security_policies_name_unique')) {
    db.exec(
      `CREATE UNIQUE INDEX idx_security_policies_name_unique
       ON security_policies(LOWER(name))
       WHERE deleted_at IS NULL`
    );
  }

  // Seed the default policy on first run. Existence-checked by name so
  // re-running migrations does not produce duplicates.
  const existing = db
    .prepare(
      'SELECT id FROM security_policies WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1'
    )
    .get(DEFAULT_SECURITY_POLICY_NAME) as { id: string } | undefined;

  if (!existing) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO security_policies (
         id, name, is_active,
         sla_critical_days, sla_high_days, sla_medium_days, sla_low_days,
         ingestion_max_bytes, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      randomUUID(),
      DEFAULT_SECURITY_POLICY_NAME,
      DEFAULT_SLA_CRITICAL_DAYS,
      DEFAULT_SLA_HIGH_DAYS,
      DEFAULT_SLA_MEDIUM_DAYS,
      DEFAULT_SLA_LOW_DAYS,
      DEFAULT_INGEST_MAX_BYTES,
      now,
      now
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS security_policies');
}
