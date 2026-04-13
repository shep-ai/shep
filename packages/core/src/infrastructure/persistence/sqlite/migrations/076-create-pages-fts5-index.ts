import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

/**
 * Migration 076: Full-text search index for pages.
 *
 * Creates a standalone FTS5 virtual table with triggers on the pages
 * table to keep the FTS index in sync. Follows the same pattern as
 * migration 067 for work items and projects.
 */
export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const ftsTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pages_fts'")
    .all() as { name: string }[];

  if (ftsTables.length === 0) {
    db.exec('CREATE VIRTUAL TABLE pages_fts USING fts5(page_id UNINDEXED, title, content)');

    // Backfill existing pages into the FTS index
    db.exec(`
      INSERT INTO pages_fts(page_id, title, content)
      SELECT id, title, COALESCE(content, '') FROM pages WHERE deleted_at IS NULL
    `);
  }

  const triggers = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('trg_pages_fts_insert', 'trg_pages_fts_update', 'trg_pages_fts_delete')"
    )
    .all() as { name: string }[];
  const triggerNames = new Set(triggers.map((t) => t.name));

  if (!triggerNames.has('trg_pages_fts_insert')) {
    db.exec(`
      CREATE TRIGGER trg_pages_fts_insert AFTER INSERT ON pages
      BEGIN
        INSERT INTO pages_fts(page_id, title, content)
        VALUES (NEW.id, NEW.title, COALESCE(NEW.content, ''));
      END
    `);
  }

  if (!triggerNames.has('trg_pages_fts_update')) {
    db.exec(`
      CREATE TRIGGER trg_pages_fts_update AFTER UPDATE ON pages
      BEGIN
        DELETE FROM pages_fts WHERE page_id = OLD.id;
        INSERT INTO pages_fts(page_id, title, content)
        VALUES (NEW.id, NEW.title, COALESCE(NEW.content, ''));
      END
    `);
  }

  if (!triggerNames.has('trg_pages_fts_delete')) {
    db.exec(`
      CREATE TRIGGER trg_pages_fts_delete AFTER DELETE ON pages
      BEGIN
        DELETE FROM pages_fts WHERE page_id = OLD.id;
      END
    `);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TRIGGER IF EXISTS trg_pages_fts_delete');
  db.exec('DROP TRIGGER IF EXISTS trg_pages_fts_update');
  db.exec('DROP TRIGGER IF EXISTS trg_pages_fts_insert');
  db.exec('DROP TABLE IF EXISTS pages_fts');
}
