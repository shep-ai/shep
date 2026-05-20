/**
 * Migration 102: Create recognition_events table (spec 097, FR-13 / FR-18 / NFR-11).
 *
 * Durable record of every contributor recognition. The UNIQUE
 * (contributor_id, kind, pr_number) constraint is the schema-level guarantee
 * for NFR-11: webhook-replay or duplicate-delivery cannot double-award the
 * same contributor for the same PR + kind.
 *
 * Foreign key cascade ensures that deleting a contributor removes all of
 * their recognition events, keeping the table consistent.
 *
 * Indexes:
 *  - unique (contributor_id, kind, pr_number) — idempotency guard.
 *  - non-unique (contributor_id) — find-by-contributor lookups.
 *  - non-unique (occurred_at) — month-bucket and recency queries.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recognition_events'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE recognition_events (
        id              TEXT PRIMARY KEY,
        contributor_id  TEXT NOT NULL,
        kind            TEXT NOT NULL,
        occurred_at     INTEGER NOT NULL,
        pr_number       INTEGER NOT NULL DEFAULT 0,
        month_recap_id  TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE CASCADE
      )
    `);
  }

  const indexes = db.pragma('index_list(recognition_events)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_recognition_events_unique_award')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_recognition_events_unique_award ON recognition_events(contributor_id, kind, pr_number)'
    );
  }
  if (!indexNames.has('idx_recognition_events_contributor_id')) {
    db.exec(
      'CREATE INDEX idx_recognition_events_contributor_id ON recognition_events(contributor_id)'
    );
  }
  if (!indexNames.has('idx_recognition_events_occurred_at')) {
    db.exec('CREATE INDEX idx_recognition_events_occurred_at ON recognition_events(occurred_at)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS recognition_events');
}
