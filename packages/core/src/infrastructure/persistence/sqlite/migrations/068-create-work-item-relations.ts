import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_item_relations'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE work_item_relations (
        id                    TEXT PRIMARY KEY,
        source_work_item_id   TEXT NOT NULL,
        target_work_item_id   TEXT NOT NULL,
        relation_type         TEXT NOT NULL,
        created_at            INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (source_work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (target_work_item_id) REFERENCES work_items(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(work_item_relations)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_work_item_relations_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_work_item_relations_unique ON work_item_relations(source_work_item_id, target_work_item_id, relation_type)'
    );
  }
  if (!indexNames.has('idx_work_item_relations_source')) {
    db.exec(
      'CREATE INDEX idx_work_item_relations_source ON work_item_relations(source_work_item_id)'
    );
  }
  if (!indexNames.has('idx_work_item_relations_target')) {
    db.exec(
      'CREATE INDEX idx_work_item_relations_target ON work_item_relations(target_work_item_id)'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS work_item_relations');
}
