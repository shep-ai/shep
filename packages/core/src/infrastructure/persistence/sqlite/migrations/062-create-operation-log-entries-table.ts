import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

/**
 * Creates the operation_log_entries table — captures structured progress
 * + diagnostic lines for long-running operations (cloud deploy, git remote
 * creation). Use cases append entries via IOperationLogService; the UI
 * fetches them through ListOperationLogEntriesUseCase.
 *
 * Composite (operation_kind, operation_id) is the natural query key —
 * indexed below so log fetches stay O(log n) as the table grows.
 */
export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operation_log_entries'")
    .get();

  if (!existing) {
    db.exec(`
      CREATE TABLE operation_log_entries (
        id TEXT PRIMARY KEY NOT NULL,
        operation_kind TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE INDEX idx_operation_log_entries_scope
        ON operation_log_entries (operation_kind, operation_id, created_at)
    `);
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Keep the table on rollback — log history is forensic data we never want to lose.
}
