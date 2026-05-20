/**
 * Migration 102 Integration Tests (spec 097, FR-13 / NFR-11).
 *
 * Verifies the recognition_events table is created with the correct schema,
 * the UNIQUE(contributor_id, kind, pr_number) constraint blocks duplicate
 * awards (NFR-11), the FK with ON DELETE CASCADE removes child rows when
 * the parent contributor is deleted, and the migration is idempotent.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  clearMigrationsAfter,
  tableExists,
  getTableIndexes,
} from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const NOW = 1_700_000_000_000;

function seedContributor(db: Database.Database, id: string, login: string): void {
  db.prepare(
    `INSERT INTO contributors (
       id, github_login, level, first_contribution_at, last_contribution_at,
       pr_count, issue_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, login, 'contributor', NOW, NOW, 1, 0, NOW, NOW);
}

function insertRecognition(
  db: Database.Database,
  args: {
    id: string;
    contributorId: string;
    kind: string;
    prNumber?: number;
    monthRecapId?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO recognition_events (
       id, contributor_id, kind, occurred_at, pr_number, month_recap_id,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    args.id,
    args.contributorId,
    args.kind,
    NOW,
    args.prNumber ?? 0,
    args.monthRecapId ?? null,
    NOW,
    NOW
  );
}

describe('Migration 102 — create recognition_events table', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates the recognition_events table', () => {
    expect(tableExists(db, 'recognition_events')).toBe(true);
  });

  it('declares the expected columns', () => {
    const columns = db.prepare('PRAGMA table_info(recognition_events)').all() as ColumnInfo[];
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get('id')).toMatchObject({ type: 'TEXT', pk: 1 });
    expect(byName.get('contributor_id')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('kind')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('occurred_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('pr_number')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('month_recap_id')).toMatchObject({ type: 'TEXT', notnull: 0 });
    expect(byName.get('created_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('updated_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
  });

  it('creates the expected indexes', () => {
    const indexes = getTableIndexes(db, 'recognition_events');
    expect(indexes).toContain('idx_recognition_events_unique_award');
    expect(indexes).toContain('idx_recognition_events_contributor_id');
    expect(indexes).toContain('idx_recognition_events_occurred_at');
  });

  it('rejects duplicate (contributor_id, kind, pr_number) inserts (NFR-11)', () => {
    seedContributor(db, 'c-1', 'octocat');
    insertRecognition(db, { id: 'r-1', contributorId: 'c-1', kind: 'firstPR', prNumber: 42 });

    expect(() =>
      insertRecognition(db, { id: 'r-2', contributorId: 'c-1', kind: 'firstPR', prNumber: 42 })
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('allows distinct (contributor_id, kind, pr_number) tuples', () => {
    seedContributor(db, 'c-1', 'octocat');
    insertRecognition(db, { id: 'r-1', contributorId: 'c-1', kind: 'firstPR', prNumber: 42 });
    insertRecognition(db, { id: 'r-2', contributorId: 'c-1', kind: 'nthPR', prNumber: 42 });
    insertRecognition(db, { id: 'r-3', contributorId: 'c-1', kind: 'firstPR', prNumber: 43 });

    const count = db
      .prepare('SELECT COUNT(*) AS n FROM recognition_events WHERE contributor_id = ?')
      .get('c-1') as { n: number };
    expect(count.n).toBe(3);
  });

  it('cascades deletes from contributor → recognition events', () => {
    seedContributor(db, 'c-1', 'octocat');
    insertRecognition(db, { id: 'r-1', contributorId: 'c-1', kind: 'firstPR', prNumber: 42 });
    insertRecognition(db, { id: 'r-2', contributorId: 'c-1', kind: 'nthPR', prNumber: 42 });

    db.prepare('DELETE FROM contributors WHERE id = ?').run('c-1');

    const remaining = db
      .prepare('SELECT COUNT(*) AS n FROM recognition_events WHERE contributor_id = ?')
      .get('c-1') as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('is idempotent (running migrations twice does not throw)', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    expect(tableExists(db, 'recognition_events')).toBe(true);
  });

  it('re-applies cleanly when migration tracking is reset to before 102', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    clearMigrationsAfter(freshDb, '101');
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();
    expect(tableExists(freshDb, 'recognition_events')).toBe(true);
    freshDb.close();
  });
});
