import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(applications)') as { name: string }[];
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has('setup_complete')) {
    db.exec('ALTER TABLE applications ADD COLUMN setup_complete INTEGER NOT NULL DEFAULT 0');
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0; leave column in place.
}
