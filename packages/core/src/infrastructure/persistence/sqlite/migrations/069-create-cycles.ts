import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cycles', 'cycle_work_items')"
    )
    .all() as { name: string }[];
  const tableNames = new Set(existingTables.map((t) => t.name));

  if (!tableNames.has('cycles')) {
    db.exec(`
      CREATE TABLE cycles (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'Upcoming',
        start_date  INTEGER,
        end_date    INTEGER,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);

    db.exec('CREATE INDEX idx_cycles_project_id ON cycles(project_id)');
    db.exec(
      'CREATE INDEX idx_cycles_project_status ON cycles(project_id, status) WHERE deleted_at IS NULL'
    );
  }

  if (!tableNames.has('cycle_work_items')) {
    db.exec(`
      CREATE TABLE cycle_work_items (
        cycle_id     TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        PRIMARY KEY (cycle_id, work_item_id),
        FOREIGN KEY (cycle_id) REFERENCES cycles(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      )
    `);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS cycle_work_items');
  db.exec('DROP TABLE IF EXISTS cycles');
}
