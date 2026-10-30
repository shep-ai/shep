/**
 * Migration 176: learned-harness tables (spec 150 — self-learning harness).
 *
 *  - learned_harness_versions  versioned overlays per scope; `components` is a
 *                              JSON array of HarnessComponent
 *  - learned_harness_edits     what each edit did, with a verdict
 *  - learned_harness_lessons   transferable lessons read by later refinements
 *  - harness_refinement_runs   one refinement of one feature run, with its ledger
 *  - learned_harness_outcomes  how each finished feature did on its version
 *
 * Timestamps are unix milliseconds, like project_memory. Scope columns mirror
 * project_memory (repository_path, scope, space_id, product_line_id) so the
 * same isolation rules apply. Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const TABLES = `
  CREATE TABLE IF NOT EXISTS learned_harness_versions (
    id                 TEXT PRIMARY KEY,
    scope              TEXT NOT NULL,
    repository_path    TEXT NOT NULL,
    space_id           TEXT,
    product_line_id    TEXT,
    parent_version_id  TEXT,
    status             TEXT NOT NULL,
    origin             TEXT NOT NULL,
    components         TEXT NOT NULL,
    notes              TEXT,
    source_feature_id  TEXT,
    refinement_run_id  TEXT,
    status_reason      TEXT,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS learned_harness_edits (
    id                 TEXT PRIMARY KEY,
    version_id         TEXT NOT NULL,
    refinement_run_id  TEXT NOT NULL,
    dimension          TEXT NOT NULL,
    component_path     TEXT NOT NULL,
    change             TEXT NOT NULL,
    observed           TEXT NOT NULL,
    verdict            TEXT NOT NULL,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS learned_harness_lessons (
    id                 TEXT PRIMARY KEY,
    scope              TEXT NOT NULL,
    repository_path    TEXT NOT NULL,
    space_id           TEXT,
    product_line_id    TEXT,
    cue                TEXT NOT NULL,
    lesson             TEXT NOT NULL,
    evidence           TEXT NOT NULL,
    confidence         TEXT NOT NULL,
    source_feature_id  TEXT NOT NULL,
    version_id         TEXT NOT NULL,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS harness_refinement_runs (
    id                    TEXT PRIMARY KEY,
    feature_id            TEXT NOT NULL,
    repository_path       TEXT NOT NULL,
    mode                  TEXT NOT NULL,
    recursion             TEXT,
    k                     INTEGER NOT NULL,
    rollouts              INTEGER NOT NULL,
    sessions              INTEGER NOT NULL,
    cost_usd              REAL NOT NULL,
    status                TEXT NOT NULL,
    candidate_version_id  TEXT,
    chosen_label          TEXT,
    selection_reason      TEXT,
    error                 TEXT,
    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS learned_harness_outcomes (
    id                  TEXT PRIMARY KEY,
    version_id          TEXT NOT NULL,
    feature_id          TEXT NOT NULL,
    ci_fix_attempts     INTEGER NOT NULL,
    gate_rejections     INTEGER NOT NULL,
    validation_repairs  INTEGER NOT NULL,
    num_turns           INTEGER NOT NULL,
    cost_usd            REAL NOT NULL,
    merged              INTEGER NOT NULL,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
  );
`;

const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_learned_harness_versions_repo_status
    ON learned_harness_versions (repository_path, status);
  CREATE INDEX IF NOT EXISTS idx_learned_harness_versions_space_scope
    ON learned_harness_versions (space_id, scope);
  CREATE INDEX IF NOT EXISTS idx_learned_harness_edits_version
    ON learned_harness_edits (version_id);
  CREATE INDEX IF NOT EXISTS idx_learned_harness_lessons_repo
    ON learned_harness_lessons (repository_path);
  CREATE INDEX IF NOT EXISTS idx_learned_harness_lessons_space_scope
    ON learned_harness_lessons (space_id, scope);
  CREATE INDEX IF NOT EXISTS idx_harness_refinement_runs_feature
    ON harness_refinement_runs (feature_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_harness_outcomes_unique_version_feature
    ON learned_harness_outcomes (version_id, feature_id);
`;

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(TABLES);
  db.exec(INDEXES);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables are harmless to an older build.
}
