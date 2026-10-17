/**
 * Migration 173: the agent coordination record on a feature (spec 141).
 *
 * `coordination` holds the last agent decision about this feature and one
 * overlapping peer as JSON (action, rationale, peer, paths, decidedAt), so the
 * web drawer and `shep feat show` can say why a dependency was drawn. NULL when
 * no agent has judged the feature.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'features', 'coordination', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a nullable column is harmless to an older build.
}
