/**
 * Migration 138: Create dev_server_run_plans table.
 *
 * Persists the per-repository analysis of how to run a dev server
 * (spec 103 agentic-dev-server). Plans are produced deterministically
 * (detectDevScript) or by structured agent analysis and cached by
 * repository path so subsequent starts skip re-analysis. The row is
 * invalidated when config_hash no longer matches the repo's config-file
 * set; install_stamp_hash tracks dependency-install staleness.
 *
 * Columns:
 *  - repo_path          TEXT PRIMARY KEY — absolute repo/worktree path (forward slashes)
 *  - plan_source        TEXT NOT NULL    — RunPlanSource enum value ('Deterministic' | 'Agent')
 *  - command            TEXT NOT NULL    — exact dev-server spawn command
 *  - cwd                TEXT NOT NULL    — spawn working directory (may be a monorepo subdir)
 *  - package_manager    TEXT             — npm/pnpm/yarn/bun; NULL for non-package stacks
 *  - expected_port      INTEGER          — expected listen port (verify-node TCP fallback)
 *  - language           TEXT             — detected primary language (informational)
 *  - framework          TEXT             — detected framework (informational)
 *  - setup_commands     TEXT NOT NULL    — JSON array of one-time setup commands, default '[]'
 *  - config_hash        TEXT NOT NULL    — hash of the config-file set that produced the plan
 *  - install_stamp_hash TEXT             — lockfile hash stamped after last successful install
 *  - created_at         TEXT NOT NULL    — ISO 8601 timestamp
 *  - updated_at         TEXT NOT NULL    — ISO 8601 timestamp
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev_server_run_plans (
      repo_path          TEXT PRIMARY KEY,
      plan_source        TEXT NOT NULL,
      command            TEXT NOT NULL,
      cwd                TEXT NOT NULL,
      package_manager    TEXT,
      expected_port      INTEGER,
      language           TEXT,
      framework          TEXT,
      setup_commands     TEXT NOT NULL DEFAULT '[]',
      config_hash        TEXT NOT NULL,
      install_stamp_hash TEXT,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL
    )
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
