import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_items'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE work_items (
        id                    TEXT PRIMARY KEY,
        project_id            TEXT NOT NULL,
        sequence_id           INTEGER NOT NULL,
        identifier_prefix     TEXT NOT NULL,
        title                 TEXT NOT NULL,
        description           TEXT,
        state_id              TEXT NOT NULL,
        priority              TEXT NOT NULL DEFAULT 'None',
        parent_id             TEXT,
        sort_order            REAL NOT NULL DEFAULT 0,
        start_date            INTEGER,
        due_date              INTEGER,
        estimate_value        TEXT,
        custom_property_values TEXT,
        created_at            INTEGER NOT NULL,
        updated_at            INTEGER NOT NULL,
        deleted_at            INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
        FOREIGN KEY (state_id) REFERENCES work_item_states(id),
        FOREIGN KEY (parent_id) REFERENCES work_items(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(work_items)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_work_items_project_seq')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_work_items_project_seq ON work_items(project_id, sequence_id)'
    );
  }
  if (!indexNames.has('idx_work_items_state_id')) {
    db.exec('CREATE INDEX idx_work_items_state_id ON work_items(state_id)');
  }
  if (!indexNames.has('idx_work_items_priority')) {
    db.exec('CREATE INDEX idx_work_items_priority ON work_items(project_id, priority)');
  }
  if (!indexNames.has('idx_work_items_due_date')) {
    db.exec('CREATE INDEX idx_work_items_due_date ON work_items(project_id, due_date)');
  }
  if (!indexNames.has('idx_work_items_parent_id')) {
    db.exec('CREATE INDEX idx_work_items_parent_id ON work_items(parent_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS work_items');
}
