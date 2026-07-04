/**
 * Migration 109: Backfill spec_path for completed (Maintain) features.
 *
 * When a feature SDLC completes, the merge node runs CleanupFeatureWorktreeUseCase
 * which removes the worktree directory from disk. Before this fix, spec_path was
 * never updated — it continued to point to the (now deleted) worktree location.
 * Reading spec files for completed features therefore failed with ENOENT.
 *
 * After merge, spec files exist at <repository_path>/specs/<specDirName>/ because
 * they are committed to the main branch. This migration repoints spec_path to the
 * repository root location for all Maintain-lifecycle features.
 *
 * Idempotent: if spec_path already points to the repository root (features
 * completed after the CleanupFeatureWorktreeUseCase fix), the computed path is
 * identical to the stored path and the UPDATE is a no-op for that row.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { join, basename } from 'node:path';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const rows = db
    .prepare(
      `SELECT id, repository_path, spec_path FROM features
       WHERE spec_path IS NOT NULL AND spec_path != '' AND lifecycle = 'Maintain'`
    )
    .all() as { id: string; repository_path: string; spec_path: string }[];

  const update = db.prepare('UPDATE features SET spec_path = ? WHERE id = ?');

  for (const row of rows) {
    const specDirName = basename(row.spec_path.replace(/[/\\]+$/, ''));
    const repoSpecPath = join(row.repository_path, 'specs', specDirName);
    update.run(repoSpecPath.replace(/\\/g, '/'), row.id);
  }
}

export async function down(): Promise<void> {
  // Not reversible — original spec_path values are not stored.
}
