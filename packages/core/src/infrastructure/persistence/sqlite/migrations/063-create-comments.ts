import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE comments (
        id           TEXT PRIMARY KEY,
        work_item_id TEXT NOT NULL,
        parent_id    TEXT,
        content      TEXT NOT NULL,
        author_id    TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (parent_id) REFERENCES comments(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(comments)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_comments_work_item_id')) {
    db.exec('CREATE INDEX idx_comments_work_item_id ON comments(work_item_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS comments');
}
