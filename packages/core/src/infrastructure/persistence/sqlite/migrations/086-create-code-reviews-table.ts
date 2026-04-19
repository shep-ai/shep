/**
 * Migration 086: Create code_reviews table.
 *
 * Stores AI-powered code review results for pull requests.
 * Comments and token usage are stored as JSON TEXT columns since they
 * are always read/written as a batch with their parent review.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_reviews'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE code_reviews (
        id              TEXT PRIMARY KEY,
        feature_id      TEXT,
        repository_path TEXT NOT NULL,
        pr_number       INTEGER NOT NULL,
        pr_url          TEXT,
        status          TEXT NOT NULL DEFAULT 'Pending',
        summary         TEXT,
        comments        TEXT,
        review_url      TEXT,
        agent_model     TEXT,
        token_usage     TEXT,
        error_message   TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(code_reviews)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_code_reviews_repo_pr')) {
    db.exec('CREATE INDEX idx_code_reviews_repo_pr ON code_reviews(repository_path, pr_number)');
  }

  if (!indexNames.has('idx_code_reviews_feature_id')) {
    db.exec('CREATE INDEX idx_code_reviews_feature_id ON code_reviews(feature_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS code_reviews');
}
