/**
 * Migration 101 Integration Tests
 *
 * Verifies the bedrock_enabled column is added to the applications
 * table with the correct shape, defaults existing rows to 0, accepts
 * stored values, and is idempotent across re-runs.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  clearMigrationsAfter,
} from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

describe('Migration 101 — applications.bedrock_enabled column', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('adds bedrock_enabled column to applications table', () => {
    const columns = db.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[];
    const col = columns.find((c) => c.name === 'bedrock_enabled');

    expect(col).toBeDefined();
    expect(col!.type).toBe('INTEGER');
    expect(col!.notnull).toBe(1);
    expect(col!.dflt_value).toBe('0');
  });

  it('defaults bedrock_enabled to 0 for new rows', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO applications (
         id, name, slug, description, repository_path, additional_paths,
         status, setup_complete, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'app-bedrock-default',
      'Test',
      'test-bedrock-default',
      '',
      '/repo',
      '[]',
      'Idle',
      0,
      now,
      now
    );

    const row = db
      .prepare('SELECT bedrock_enabled FROM applications WHERE id = ?')
      .get('app-bedrock-default') as { bedrock_enabled: number };

    expect(row.bedrock_enabled).toBe(0);
  });

  it('accepts storing bedrock_enabled = 1', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO applications (
         id, name, slug, description, repository_path, additional_paths,
         status, setup_complete, created_at, updated_at, bedrock_enabled
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('app-bedrock-on', 'Test', 'test-bedrock-on', '', '/repo', '[]', 'Idle', 0, now, now, 1);

    const row = db
      .prepare('SELECT bedrock_enabled FROM applications WHERE id = ?')
      .get('app-bedrock-on') as { bedrock_enabled: number };

    expect(row.bedrock_enabled).toBe(1);
  });

  it('is idempotent (running migrations twice does not throw)', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const columns = db.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[];
    expect(columns.find((c) => c.name === 'bedrock_enabled')).toBeDefined();
  });

  it('re-applies cleanly when migration tracking is reset to before 101', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    clearMigrationsAfter(freshDb, '100');
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();

    const columns = freshDb.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[];
    expect(columns.find((c) => c.name === 'bedrock_enabled')).toBeDefined();

    freshDb.close();
  });
});
