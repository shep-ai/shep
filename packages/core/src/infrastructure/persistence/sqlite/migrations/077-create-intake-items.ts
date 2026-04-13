import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='intake_items'")
    .all() as { name: string }[];

  if (existingTables.length === 0) {
    db.exec(`
      CREATE TABLE intake_items (
        id                       TEXT PRIMARY KEY,
        project_id               TEXT NOT NULL,
        title                    TEXT NOT NULL,
        description              TEXT,
        source                   TEXT NOT NULL DEFAULT 'manual',
        status                   TEXT NOT NULL DEFAULT 'Pending',
        triage_notes             TEXT,
        suggested_state_id       TEXT,
        suggested_priority       TEXT,
        suggested_labels         TEXT,
        suggested_assignee_id    TEXT,
        resulting_work_item_id   TEXT,
        decline_reason           TEXT,
        duplicate_of_work_item_id TEXT,
        created_at               INTEGER NOT NULL,
        updated_at               INTEGER NOT NULL,
        deleted_at               INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
        FOREIGN KEY (resulting_work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (duplicate_of_work_item_id) REFERENCES work_items(id)
      )
    `);

    db.exec('CREATE INDEX idx_intake_items_project_id ON intake_items(project_id)');
    db.exec('CREATE INDEX idx_intake_items_status ON intake_items(status)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS intake_items');
}
