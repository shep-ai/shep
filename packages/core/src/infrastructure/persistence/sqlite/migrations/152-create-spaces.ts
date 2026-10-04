/**
 * Migration 152: Spaces and product lines (spec 120).
 *
 * - spaces: hard knowledge boundaries; the default space is seeded with a fixed
 *   id so code can fall back to it without a query.
 * - product_lines: groups of repositories inside one space (slug unique per space).
 * - space_rules: path-prefix or remote-pattern rules mapping repositories to a
 *   space and optionally a product line.
 * - repository_space_assignments: explicit placements keyed by normalised
 *   repository path; they beat every rule.
 * - project_memory gains space_id and product_line_id. Every existing row is
 *   stamped with the default space. Legacy 'Organization' rows keep their scope
 *   so a rolled-back build still reads them.
 *
 * Additive and guarded so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

/** Mirrors DEFAULT_SPACE_ID in domain/shared/space-resolution.ts (migrations are frozen copies). */
const DEFAULT_SPACE_ID = '00000000-0000-4000-8000-000000000120';

function columnNames(db: Database.Database, table: string): Set<string> {
  const columns = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(columns.map((c) => c.name));
}

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_lines (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (space_id, slug)
    );
    CREATE INDEX IF NOT EXISTS idx_product_lines_space ON product_lines (space_id);

    CREATE TABLE IF NOT EXISTS space_rules (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      product_line_id TEXT,
      kind TEXT NOT NULL,
      pattern TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_space_rules_space ON space_rules (space_id);

    CREATE TABLE IF NOT EXISTS repository_space_assignments (
      repository_path TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      product_line_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repository_space_assignments_space
      ON repository_space_assignments (space_id);
  `);

  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO spaces (id, name, slug, description, color, is_default, created_at, updated_at)
     VALUES (?, 'Default', 'default', NULL, NULL, 1, ?, ?)`
  ).run(DEFAULT_SPACE_ID, now, now);

  const memoryColumns = columnNames(db, 'project_memory');
  if (!memoryColumns.has('space_id')) {
    db.exec('ALTER TABLE project_memory ADD COLUMN space_id TEXT');
  }
  if (!memoryColumns.has('product_line_id')) {
    db.exec('ALTER TABLE project_memory ADD COLUMN product_line_id TEXT');
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_project_memory_space_scope ON project_memory (space_id, scope)'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_project_memory_product_line ON project_memory (product_line_id)'
  );
  db.prepare('UPDATE project_memory SET space_id = ? WHERE space_id IS NULL').run(DEFAULT_SPACE_ID);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: the new tables and nullable columns are harmless to an
  // older build, so rolling back leaves them in place.
}
