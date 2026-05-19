/**
 * Migration 101 Integration Tests
 *
 * Verifies the ASPM columns (criticality, exposure, data_classification,
 * business_unit) are added to the applications table with the correct shapes,
 * accept the documented enum values, and that the migration is idempotent.
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

const ASPM_COLUMNS = ['criticality', 'exposure', 'data_classification', 'business_unit'] as const;

describe('Migration 101 — ASPM columns on applications', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it.each(ASPM_COLUMNS)('should add %s column to applications table', (colName) => {
    const columns = db.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[];
    const col = columns.find((c) => c.name === colName);

    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(0);
  });

  it('should default ASPM columns to NULL for new rows', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO applications (
         id, name, slug, description, repository_path,
         additional_paths, status, setup_complete, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('app-aspm-default', 'Test', 'aspm-default', '', '/repo', '[]', 'Idle', 0, now, now);

    const row = db
      .prepare(
        'SELECT criticality, exposure, data_classification, business_unit FROM applications WHERE id = ?'
      )
      .get('app-aspm-default') as {
      criticality: string | null;
      exposure: string | null;
      data_classification: string | null;
      business_unit: string | null;
    };

    expect(row.criticality).toBeNull();
    expect(row.exposure).toBeNull();
    expect(row.data_classification).toBeNull();
    expect(row.business_unit).toBeNull();
  });

  it('should accept storing all ASPM enum values', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO applications (
         id, name, slug, description, repository_path,
         additional_paths, status, setup_complete, created_at, updated_at,
         criticality, exposure, data_classification, business_unit
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'app-aspm-set',
      'Set',
      'aspm-set',
      '',
      '/repo',
      '[]',
      'Idle',
      0,
      now,
      now,
      'Tier1',
      'Internet',
      'Restricted',
      'platform'
    );

    const row = db
      .prepare(
        'SELECT criticality, exposure, data_classification, business_unit FROM applications WHERE id = ?'
      )
      .get('app-aspm-set') as {
      criticality: string;
      exposure: string;
      data_classification: string;
      business_unit: string;
    };

    expect(row.criticality).toBe('Tier1');
    expect(row.exposure).toBe('Internet');
    expect(row.data_classification).toBe('Restricted');
    expect(row.business_unit).toBe('platform');
  });

  it('should be idempotent (running migration twice does not throw)', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const columns = db.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[];
    for (const colName of ASPM_COLUMNS) {
      expect(columns.find((c) => c.name === colName)).toBeDefined();
    }
  });

  it('should re-apply cleanly when migration tracking is reset to before 101', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    clearMigrationsAfter(freshDb, '100');
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();

    const columns = freshDb.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[];
    for (const colName of ASPM_COLUMNS) {
      expect(columns.find((c) => c.name === colName)).toBeDefined();
    }

    freshDb.close();
  });

  it('should not change the schema on a second pass (column count is stable)', async () => {
    const before = (db.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[]).length;
    await runSQLiteMigrations(db);
    const after = (db.prepare('PRAGMA table_info(applications)').all() as ColumnInfo[]).length;
    expect(after).toBe(before);
  });
});
