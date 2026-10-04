/**
 * Migration 154: Tracker sync (spec 122).
 *
 * - tracker_connections: Linear / Jira accounts, owned by a space. The secret
 *   is AES-GCM encrypted with LocalSecretBox (ciphertext, iv, tag).
 * - tracker_sync_rules: a tracker scope kept in a shep project; last_run is a
 *   JSON summary of the previous run.
 * - tracker_issue_links: one row per synced work item, with the values both
 *   sides had at the last sync. (connection_id, external_id) is unique so an
 *   issue can never be imported twice.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracker_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      space_id TEXT NOT NULL,
      site_url TEXT,
      account_email TEXT,
      account_name TEXT,
      status TEXT NOT NULL,
      last_error TEXT,
      last_checked_at INTEGER,
      secret_ciphertext BLOB NOT NULL,
      secret_iv BLOB NOT NULL,
      secret_tag BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracker_sync_rules (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      direction TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      cursor INTEGER,
      last_run_at INTEGER,
      last_run TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tracker_sync_rules_connection
      ON tracker_sync_rules (connection_id);

    CREATE TABLE IF NOT EXISTS tracker_issue_links (
      work_item_id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      external_key TEXT NOT NULL,
      external_url TEXT NOT NULL,
      synced_title TEXT NOT NULL,
      synced_description TEXT,
      synced_state_group TEXT NOT NULL,
      synced_priority TEXT NOT NULL,
      remote_updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (connection_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tracker_issue_links_rule ON tracker_issue_links (rule_id);
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables are harmless to an older build.
}
