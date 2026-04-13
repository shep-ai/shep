import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_users'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE pm_users (
        id              TEXT PRIMARY KEY,
        email           TEXT NOT NULL,
        password_hash   TEXT NOT NULL,
        display_name    TEXT NOT NULL,
        is_system_user  INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(pm_users)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_pm_users_email')) {
    db.exec('CREATE UNIQUE INDEX idx_pm_users_email ON pm_users(email) WHERE deleted_at IS NULL');
  }

  if (!indexNames.has('idx_pm_users_system')) {
    db.exec('CREATE INDEX idx_pm_users_system ON pm_users(is_system_user)');
  }

  // Create a default system user for backward compatibility with single-user data
  const existing = db.prepare('SELECT id FROM pm_users WHERE is_system_user = 1').get();
  if (!existing) {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO pm_users (id, email, password_hash, display_name, is_system_user, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000000', 'system@shep.local', '', 'System User', 1, ?, ?)
    `
    ).run(now, now);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_users');
}
