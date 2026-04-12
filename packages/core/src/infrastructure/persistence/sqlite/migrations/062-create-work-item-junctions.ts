import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('work_item_labels', 'work_item_assignees')"
    )
    .all() as { name: string }[];
  const tableNames = new Set(existingTables.map((t) => t.name));

  if (!tableNames.has('work_item_labels')) {
    db.exec(`
      CREATE TABLE work_item_labels (
        work_item_id TEXT NOT NULL,
        label_id     TEXT NOT NULL,
        PRIMARY KEY (work_item_id, label_id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (label_id) REFERENCES labels(id)
      )
    `);
  }

  if (!tableNames.has('work_item_assignees')) {
    db.exec(`
      CREATE TABLE work_item_assignees (
        work_item_id TEXT NOT NULL,
        assignee_id  TEXT NOT NULL,
        PRIMARY KEY (work_item_id, assignee_id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      )
    `);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS work_item_assignees');
  db.exec('DROP TABLE IF EXISTS work_item_labels');
}
