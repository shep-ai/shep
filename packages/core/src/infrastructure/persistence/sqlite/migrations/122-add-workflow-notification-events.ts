/**
 * Migration 044: Add workflow notification event columns to settings table.
 *
 * Adds three new notification event type filter columns for scheduled
 * workflow execution events: started, completed, and failed.
 * All default to 1 (enabled).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];

  if (!columns.some((c) => c.name === 'notif_evt_workflow_started')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN notif_evt_workflow_started INTEGER NOT NULL DEFAULT 1'
    );
  }
  if (!columns.some((c) => c.name === 'notif_evt_workflow_completed')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN notif_evt_workflow_completed INTEGER NOT NULL DEFAULT 1'
    );
  }
  if (!columns.some((c) => c.name === 'notif_evt_workflow_failed')) {
    db.exec('ALTER TABLE settings ADD COLUMN notif_evt_workflow_failed INTEGER NOT NULL DEFAULT 1');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
