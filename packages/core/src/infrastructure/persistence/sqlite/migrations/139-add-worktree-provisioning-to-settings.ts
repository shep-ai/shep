/**
 * Migration 139: Add custom worktree provisioning columns to the settings table.
 *
 * Backs `settings.worktree` (WorktreeConfig): a user-supplied command that
 * replaces `git worktree add`, a command run inside the worktree afterwards,
 * and a shared timeout. All nullable — NULL means "use the built-in git
 * worktree flow", which is the pre-existing behaviour.
 *
 * Additive only and guarded by PRAGMA so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('worktree_create_command')) {
    db.exec('ALTER TABLE settings ADD COLUMN worktree_create_command TEXT');
  }
  if (!names.has('worktree_post_create_command')) {
    db.exec('ALTER TABLE settings ADD COLUMN worktree_post_create_command TEXT');
  }
  if (!names.has('worktree_command_timeout_ms')) {
    db.exec('ALTER TABLE settings ADD COLUMN worktree_command_timeout_ms INTEGER');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
