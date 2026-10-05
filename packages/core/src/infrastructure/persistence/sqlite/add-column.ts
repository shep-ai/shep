/**
 * Adds a column only when the table lacks it, so additive migrations stay
 * idempotent. Lives beside `migrations/` because every file inside that
 * directory is loaded as a migration.
 */

import type Database from 'better-sqlite3';

export function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((existing) => existing.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
