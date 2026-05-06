/**
 * Migration 101: Create contributors table (spec 097, FR-12 / FR-18).
 *
 * External OSS contributor identity, distinct from PmUser (internal
 * stakeholders). One row per (githubLogin) — enforced via the unique index.
 *
 * Indexes:
 *  - unique (github_login) — for `findByGitHubLogin` and to enforce one
 *    contributor row per GitHub identity.
 *  - non-unique (level) — supports leaderboard / ladder queries.
 *  - non-unique (last_contribution_at) — supports recency-ordered listings.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contributors'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE contributors (
        id                      TEXT PRIMARY KEY,
        github_login            TEXT NOT NULL,
        display_name            TEXT,
        avatar_url              TEXT,
        lane                    TEXT,
        level                   TEXT NOT NULL,
        first_contribution_at   INTEGER NOT NULL,
        last_contribution_at    INTEGER NOT NULL,
        pr_count                INTEGER NOT NULL DEFAULT 0,
        issue_count             INTEGER NOT NULL DEFAULT 0,
        created_at              INTEGER NOT NULL,
        updated_at              INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(contributors)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_contributors_unique_login')) {
    db.exec('CREATE UNIQUE INDEX idx_contributors_unique_login ON contributors(github_login)');
  }
  if (!indexNames.has('idx_contributors_level')) {
    db.exec('CREATE INDEX idx_contributors_level ON contributors(level)');
  }
  if (!indexNames.has('idx_contributors_last_contribution_at')) {
    db.exec(
      'CREATE INDEX idx_contributors_last_contribution_at ON contributors(last_contribution_at)'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS contributors');
}
