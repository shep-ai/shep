import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const NEW_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'git_remote_url', ddl: 'ALTER TABLE applications ADD COLUMN git_remote_url TEXT' },
  {
    name: 'cloud_deployment_provider',
    ddl: 'ALTER TABLE applications ADD COLUMN cloud_deployment_provider TEXT',
  },
  {
    name: 'cloud_deployment_status',
    ddl: 'ALTER TABLE applications ADD COLUMN cloud_deployment_status TEXT',
  },
  {
    name: 'cloud_deployment_id',
    ddl: 'ALTER TABLE applications ADD COLUMN cloud_deployment_id TEXT',
  },
  {
    name: 'cloud_deployment_url',
    ddl: 'ALTER TABLE applications ADD COLUMN cloud_deployment_url TEXT',
  },
  {
    name: 'cloud_deployment_error',
    ddl: 'ALTER TABLE applications ADD COLUMN cloud_deployment_error TEXT',
  },
  { name: 'last_deployed_at', ddl: 'ALTER TABLE applications ADD COLUMN last_deployed_at INTEGER' },
];

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(applications)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));
  for (const { name, ddl } of NEW_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(ddl);
    }
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0; leave columns in place.
}
