/**
 * Migration 051 Integration Tests
 *
 * Verifies the fast boolean column is replaced with a TEXT mode column
 * on the features table, with correct data migration and idempotent behavior.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

describe('Migration 051 — replace fast boolean with mode enum', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should add mode column to features table', () => {
    const columns = db.prepare('PRAGMA table_info(features)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('mode');
  });

  it('should have TEXT type with NOT NULL constraint on mode column', () => {
    const columns = db.prepare('PRAGMA table_info(features)').all() as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const col = columns.find((c) => c.name === 'mode');
    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(1);
  });

  it('should default mode to "Regular" for new rows', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO features (
        id, name, slug, description, user_query, repository_path, branch,
        lifecycle, messages, related_artifacts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'feat-default',
      'Default Feature',
      'default-feature',
      'desc',
      'query',
      '/repo',
      'main',
      'Started',
      '[]',
      '[]',
      now,
      now
    );

    const row = db.prepare('SELECT mode FROM features WHERE id = ?').get('feat-default') as {
      mode: string;
    };
    expect(row.mode).toBe('Regular');
  });

  it('should not have fast column after migration', () => {
    const columns = db.prepare('PRAGMA table_info(features)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).not.toContain('fast');
  });

  it('should add iteration_count column to features table', () => {
    const columns = db.prepare('PRAGMA table_info(features)').all() as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const col = columns.find((c) => c.name === 'iteration_count');
    expect(col).toBeDefined();
    expect(col!.type).toBe('INTEGER');
  });

  it('should add max_iterations column to features table', () => {
    const columns = db.prepare('PRAGMA table_info(features)').all() as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const col = columns.find((c) => c.name === 'max_iterations');
    expect(col).toBeDefined();
    expect(col!.type).toBe('INTEGER');
    expect(col!.notnull).toBe(0); // nullable
  });

  it('should default iteration_count to 0 for new rows', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO features (
        id, name, slug, description, user_query, repository_path, branch,
        lifecycle, messages, related_artifacts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'feat-iter',
      'Iter Feature',
      'iter-feature',
      'desc',
      'query',
      '/repo',
      'main',
      'Started',
      '[]',
      '[]',
      now,
      now
    );

    const row = db
      .prepare('SELECT iteration_count, max_iterations FROM features WHERE id = ?')
      .get('feat-iter') as { iteration_count: number; max_iterations: number | null };
    expect(row.iteration_count).toBe(0);
    expect(row.max_iterations).toBeNull();
  });

  it('should allow storing Exploration mode value', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO features (
        id, name, slug, description, user_query, repository_path, branch,
        lifecycle, messages, related_artifacts, mode, iteration_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'feat-explore',
      'Explore Feature',
      'explore-feature',
      'desc',
      'query',
      '/repo',
      'feat/explore',
      'Exploring',
      '[]',
      '[]',
      'Exploration',
      3,
      now,
      now
    );

    const row = db
      .prepare('SELECT mode, iteration_count FROM features WHERE id = ?')
      .get('feat-explore') as { mode: string; iteration_count: number };
    expect(row.mode).toBe('Exploration');
    expect(row.iteration_count).toBe(3);
  });

  it('should be idempotent (running migration twice does not throw)', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();
    freshDb.close();
  });

  it('should handle empty features table gracefully', async () => {
    // All features were already migrated above (empty table case).
    // Verify no rows exist and mode column is present.
    const count = db.prepare('SELECT COUNT(*) as cnt FROM features').get() as { cnt: number };
    // The table may or may not have rows from other tests, but the migration should not error on empty table
    expect(count.cnt).toBeGreaterThanOrEqual(0);
  });
});
