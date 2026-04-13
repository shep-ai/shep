import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_project_members'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE pm_project_members (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'Member',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
        FOREIGN KEY (user_id) REFERENCES pm_users(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(pm_project_members)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_pm_project_members_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_pm_project_members_unique ON pm_project_members(project_id, user_id) WHERE deleted_at IS NULL'
    );
  }

  if (!indexNames.has('idx_pm_project_members_user')) {
    db.exec('CREATE INDEX idx_pm_project_members_user ON pm_project_members(user_id)');
  }

  if (!indexNames.has('idx_pm_project_members_project')) {
    db.exec('CREATE INDEX idx_pm_project_members_project ON pm_project_members(project_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_project_members');
}
