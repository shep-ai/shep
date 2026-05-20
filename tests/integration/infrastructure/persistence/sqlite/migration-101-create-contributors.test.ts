/**
 * Migration 101 Integration Tests (spec 097, FR-12 / FR-18).
 *
 * Verifies the contributors table is created with the expected schema and
 * indexes, the unique-by-github-login constraint is enforced, and the
 * migration is idempotent under repeated runs and post-reset re-application.
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

describe('Migration 101 — create contributors table', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates the contributors table', () => {
    expect(tableExists(db, 'contributors')).toBe(true);
  });

  it('declares the expected columns with correct types and nullability', () => {
    const columns = db.prepare('PRAGMA table_info(contributors)').all() as ColumnInfo[];
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get('id')).toMatchObject({ type: 'TEXT', pk: 1 });
    expect(byName.get('github_login')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('display_name')).toMatchObject({ type: 'TEXT', notnull: 0 });
    expect(byName.get('avatar_url')).toMatchObject({ type: 'TEXT', notnull: 0 });
    expect(byName.get('lane')).toMatchObject({ type: 'TEXT', notnull: 0 });
    expect(byName.get('level')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('first_contribution_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('last_contribution_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('pr_count')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('issue_count')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('created_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('updated_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
  });

  it('creates the expected indexes', () => {
    const indexes = getTableIndexes(db, 'contributors');
    expect(indexes).toContain('idx_contributors_unique_login');
    expect(indexes).toContain('idx_contributors_level');
    expect(indexes).toContain('idx_contributors_last_contribution_at');
  });

  it('enforces uniqueness on github_login', () => {
    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO contributors (
         id, github_login, level, first_contribution_at, last_contribution_at,
         pr_count, issue_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run('c-1', 'octocat', 'contributor', now, now, 1, 0, now, now);

    expect(() => insert.run('c-2', 'octocat', 'contributor', now, now, 1, 0, now, now)).toThrow(
      /UNIQUE constraint failed/
    );
  });

  it('is idempotent (running migrations twice does not throw)', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    expect(tableExists(db, 'contributors')).toBe(true);
  });

  it('re-applies cleanly when migration tracking is reset to before 101', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    clearMigrationsAfter(freshDb, '100');
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();
    expect(tableExists(freshDb, 'contributors')).toBe(true);
    freshDb.close();
  });
});
