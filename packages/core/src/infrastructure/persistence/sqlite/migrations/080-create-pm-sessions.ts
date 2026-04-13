import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_sessions'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE pm_sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        token       TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        FOREIGN KEY (user_id) REFERENCES pm_users(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(pm_sessions)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_pm_sessions_token')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_pm_sessions_token ON pm_sessions(token) WHERE deleted_at IS NULL'
    );
  }

  if (!indexNames.has('idx_pm_sessions_user_id')) {
    db.exec('CREATE INDEX idx_pm_sessions_user_id ON pm_sessions(user_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_sessions');
}
