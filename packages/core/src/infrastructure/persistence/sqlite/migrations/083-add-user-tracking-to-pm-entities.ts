import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

/**
 * Adds created_by and updated_by columns to all PM entity tables
 * for user attribution tracking. These columns reference pm_users(id)
 * and are nullable for backward compatibility with existing data.
 *
 * Backfills existing rows with the default system user ID.
 */
export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  const pmTables = [
    'pm_projects',
    'work_items',
    'work_item_states',
    'labels',
    'comments',
    'saved_views',
    'cycles',
    'pm_modules',
    'pages',
    'page_versions',
    'pm_attachments',
    'epics',
    'intake_items',
    'pm_notifications',
    'time_entries',
  ];

  for (const table of pmTables) {
    // Check table exists
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;

    // Check column doesn't already exist
    const columns = db.pragma(`table_info(${table})`) as { name: string }[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('created_by')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN created_by TEXT`);
      db.exec(`UPDATE ${table} SET created_by = '${SYSTEM_USER_ID}' WHERE created_by IS NULL`);
    }

    if (!columnNames.has('updated_by')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN updated_by TEXT`);
      db.exec(`UPDATE ${table} SET updated_by = '${SYSTEM_USER_ID}' WHERE updated_by IS NULL`);
    }
  }
}

export async function down({ context: _db }: MigrationParams<Database.Database>): Promise<void> {
  // Additive-only per LESSONS.md — columns remain in place on rollback
}
