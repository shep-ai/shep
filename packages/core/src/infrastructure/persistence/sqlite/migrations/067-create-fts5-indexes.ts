import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

/**
 * Migration 067: Full-text search indexes for work items and projects.
 *
 * Creates standalone FTS5 virtual tables (not external-content) with
 * triggers on the source tables to keep the FTS indexes in sync.
 *
 * FTS5 does not support UPDATE — the triggers use DELETE + INSERT
 * for update operations.
 */
export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // ── work_items_fts ──────────────────────────────────────────────────
  const workItemsFtsTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_items_fts'")
    .all() as { name: string }[];

  if (workItemsFtsTables.length === 0) {
    db.exec(
      'CREATE VIRTUAL TABLE work_items_fts USING fts5(work_item_id UNINDEXED, title, description)'
    );
  }

  const workItemsTriggers = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('trg_work_items_fts_insert', 'trg_work_items_fts_update', 'trg_work_items_fts_delete')"
    )
    .all() as { name: string }[];
  const workItemsTriggerNames = new Set(workItemsTriggers.map((t) => t.name));

  if (!workItemsTriggerNames.has('trg_work_items_fts_insert')) {
    db.exec(`
      CREATE TRIGGER trg_work_items_fts_insert AFTER INSERT ON work_items
      BEGIN
        INSERT INTO work_items_fts(work_item_id, title, description)
        VALUES (NEW.id, NEW.title, COALESCE(NEW.description, ''));
      END
    `);
  }

  if (!workItemsTriggerNames.has('trg_work_items_fts_update')) {
    db.exec(`
      CREATE TRIGGER trg_work_items_fts_update AFTER UPDATE ON work_items
      BEGIN
        DELETE FROM work_items_fts WHERE work_item_id = OLD.id;
        INSERT INTO work_items_fts(work_item_id, title, description)
        VALUES (NEW.id, NEW.title, COALESCE(NEW.description, ''));
      END
    `);
  }

  if (!workItemsTriggerNames.has('trg_work_items_fts_delete')) {
    db.exec(`
      CREATE TRIGGER trg_work_items_fts_delete AFTER DELETE ON work_items
      BEGIN
        DELETE FROM work_items_fts WHERE work_item_id = OLD.id;
      END
    `);
  }

  // ── pm_projects_fts ─────────────────────────────────────────────────
  const projectsFtsTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_projects_fts'")
    .all() as { name: string }[];

  if (projectsFtsTables.length === 0) {
    db.exec(
      'CREATE VIRTUAL TABLE pm_projects_fts USING fts5(project_id UNINDEXED, name, description)'
    );
  }

  const projectsTriggers = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('trg_pm_projects_fts_insert', 'trg_pm_projects_fts_update', 'trg_pm_projects_fts_delete')"
    )
    .all() as { name: string }[];
  const projectsTriggerNames = new Set(projectsTriggers.map((t) => t.name));

  if (!projectsTriggerNames.has('trg_pm_projects_fts_insert')) {
    db.exec(`
      CREATE TRIGGER trg_pm_projects_fts_insert AFTER INSERT ON pm_projects
      BEGIN
        INSERT INTO pm_projects_fts(project_id, name, description)
        VALUES (NEW.id, NEW.name, COALESCE(NEW.description, ''));
      END
    `);
  }

  if (!projectsTriggerNames.has('trg_pm_projects_fts_update')) {
    db.exec(`
      CREATE TRIGGER trg_pm_projects_fts_update AFTER UPDATE ON pm_projects
      BEGIN
        DELETE FROM pm_projects_fts WHERE project_id = OLD.id;
        INSERT INTO pm_projects_fts(project_id, name, description)
        VALUES (NEW.id, NEW.name, COALESCE(NEW.description, ''));
      END
    `);
  }

  if (!projectsTriggerNames.has('trg_pm_projects_fts_delete')) {
    db.exec(`
      CREATE TRIGGER trg_pm_projects_fts_delete AFTER DELETE ON pm_projects
      BEGIN
        DELETE FROM pm_projects_fts WHERE project_id = OLD.id;
      END
    `);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // Drop triggers first (they reference the source tables)
  db.exec('DROP TRIGGER IF EXISTS trg_pm_projects_fts_delete');
  db.exec('DROP TRIGGER IF EXISTS trg_pm_projects_fts_update');
  db.exec('DROP TRIGGER IF EXISTS trg_pm_projects_fts_insert');
  db.exec('DROP TRIGGER IF EXISTS trg_work_items_fts_delete');
  db.exec('DROP TRIGGER IF EXISTS trg_work_items_fts_update');
  db.exec('DROP TRIGGER IF EXISTS trg_work_items_fts_insert');

  // Drop FTS virtual tables
  db.exec('DROP TABLE IF EXISTS pm_projects_fts');
  db.exec('DROP TABLE IF EXISTS work_items_fts');
}
