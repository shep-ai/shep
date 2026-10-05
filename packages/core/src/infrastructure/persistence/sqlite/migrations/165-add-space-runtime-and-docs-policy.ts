/**
 * Migration 165: the space policies added by specs 129 and 131.
 *
 * - spaces.auto_runtime_actions: JSON array of RuntimeActionKind shep may run
 *   on an incident without asking.
 * - spaces.docs_first: 1 when the space develops docs first.
 * - spaces.docs_paths: JSON array of documentation path prefixes.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'spaces', 'auto_runtime_actions', 'TEXT');
  addColumn(db, 'spaces', 'docs_first', 'INTEGER');
  addColumn(db, 'spaces', 'docs_paths', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: nullable columns are harmless to an older build.
}
