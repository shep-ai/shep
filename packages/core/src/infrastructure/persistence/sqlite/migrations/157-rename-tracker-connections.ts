/**
 * Migration 157: tracker_connections becomes connections (spec 125).
 *
 * Connections now hold accounts in any outside tool (issue trackers, knowledge
 * bases, …), not only trackers. The rows and their encrypted secrets move
 * unchanged. Idempotent: does nothing once renamed.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

function tableExists(db: Database.Database, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  if (tableExists(db, 'tracker_connections') && !tableExists(db, 'connections')) {
    db.exec('ALTER TABLE tracker_connections RENAME TO connections');
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Renaming back would break this build's repository; leave the table as it is.
}
