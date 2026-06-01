/**
 * Migration 108: whatsapp_thread_mappings table (spec 101).
 *
 * Binds a WhatsApp conversation thread to the shep entity it drives (a Feature
 * or an interactive Application session) so that replies route to the right
 * target and outbound notifications find the originating thread.
 *
 * `thread_id` is the primary key — a thread maps to at most one active target;
 * re-binding overwrites the row. An index on (target_kind, target_id) supports
 * the outbound "find the thread for this feature/app" lookup.
 *
 * Idempotent (guarded by sqlite_master check). `down()` keeps the table to
 * avoid losing routing state on rollback (matches the project convention).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_thread_mappings'"
    )
    .get();

  if (!existing) {
    db.exec(`
      CREATE TABLE whatsapp_thread_mappings (
        thread_id TEXT PRIMARY KEY,
        target_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    db.exec(
      `CREATE INDEX idx_whatsapp_thread_mappings_target
         ON whatsapp_thread_mappings (target_kind, target_id, active)`
    );
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Keep the table on rollback to avoid losing thread→session routing state.
}
