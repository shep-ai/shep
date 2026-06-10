/**
 * Migration 121: Add exploration tracking columns to the features table.
 *
 * Adds iteration_count and max_iterations columns to support the Exploration
 * build mode's iterative feedback loop. These columns track how many feedback
 * iterations have occurred and the maximum allowed for a given exploration run.
 *
 * Guards against duplicate columns using PRAGMA table_info.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('iteration_count')) {
    db.exec('ALTER TABLE features ADD COLUMN iteration_count INTEGER NOT NULL DEFAULT 0');
  }

  if (!names.has('max_iterations')) {
    db.exec('ALTER TABLE features ADD COLUMN max_iterations INTEGER');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
