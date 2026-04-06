/**
 * Migration 055: Add token optimization config and metrics columns.
 *
 * Settings table — token optimization config (all default to 1 = enabled):
 *  - token_opt_enabled (INTEGER DEFAULT 1)
 *  - token_opt_output_filtering (INTEGER DEFAULT 1)
 *  - token_opt_skill_routing (INTEGER DEFAULT 1)
 *  - token_opt_delta_context (INTEGER DEFAULT 1)
 *  - token_opt_semantic_compression (INTEGER DEFAULT 1)
 *  - token_opt_alias_compression (INTEGER DEFAULT 1)
 *
 * Phase timings table — optimization metrics (all nullable, no defaults):
 *  - original_token_estimate (INTEGER)
 *  - optimized_token_estimate (INTEGER)
 *  - savings_percent (REAL)
 *  - capabilities_applied (TEXT)
 *  - output_filter_lines_removed (INTEGER)
 *  - delta_context_files_skipped (INTEGER)
 *  - compression_ratio (REAL)
 *  - aliases_created (INTEGER)
 *
 * All columns are additive-only. No drops, no renames.
 * Guards against duplicate column errors using table_info pragma.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // --- Settings table: token optimization config ---
  const settingsCols = db.pragma('table_info(settings)') as { name: string }[];
  const settingsNames = new Set(settingsCols.map((c) => c.name));

  if (!settingsNames.has('token_opt_enabled')) {
    db.exec('ALTER TABLE settings ADD COLUMN token_opt_enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsNames.has('token_opt_output_filtering')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN token_opt_output_filtering INTEGER NOT NULL DEFAULT 1'
    );
  }
  if (!settingsNames.has('token_opt_skill_routing')) {
    db.exec('ALTER TABLE settings ADD COLUMN token_opt_skill_routing INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsNames.has('token_opt_delta_context')) {
    db.exec('ALTER TABLE settings ADD COLUMN token_opt_delta_context INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingsNames.has('token_opt_semantic_compression')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN token_opt_semantic_compression INTEGER NOT NULL DEFAULT 1'
    );
  }
  if (!settingsNames.has('token_opt_alias_compression')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN token_opt_alias_compression INTEGER NOT NULL DEFAULT 1'
    );
  }

  // --- Phase timings table: optimization metrics ---
  const timingsCols = db.pragma('table_info(phase_timings)') as { name: string }[];
  const timingsNames = new Set(timingsCols.map((c) => c.name));

  if (!timingsNames.has('original_token_estimate')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN original_token_estimate INTEGER');
  }
  if (!timingsNames.has('optimized_token_estimate')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN optimized_token_estimate INTEGER');
  }
  if (!timingsNames.has('savings_percent')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN savings_percent REAL');
  }
  if (!timingsNames.has('capabilities_applied')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN capabilities_applied TEXT');
  }
  if (!timingsNames.has('output_filter_lines_removed')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN output_filter_lines_removed INTEGER');
  }
  if (!timingsNames.has('delta_context_files_skipped')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN delta_context_files_skipped INTEGER');
  }
  if (!timingsNames.has('compression_ratio')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN compression_ratio REAL');
  }
  if (!timingsNames.has('aliases_created')) {
    db.exec('ALTER TABLE phase_timings ADD COLUMN aliases_created INTEGER');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
