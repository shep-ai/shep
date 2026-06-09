/**
 * Migration 113 Integration Tests
 *
 * Verifies the remediation_campaigns table is created with the expected
 * columns + indexes and that re-running migrations is a no-op (NFR-18).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface IndexInfo {
  name: string;
}

const REQUIRED_COLUMNS: [string, number, number][] = [
  ['id', 0, 1],
  ['name', 1, 0],
  ['description', 1, 0],
  ['target_query_json', 1, 0],
  ['status', 1, 0],
  ['owner_id', 0, 0],
  ['due_date', 0, 0],
  ['closed_at', 0, 0],
  ['audit_log', 1, 0],
  ['created_at', 1, 0],
  ['updated_at', 1, 0],
  ['deleted_at', 0, 0],
];

describe('Migration 113 — remediation_campaigns table', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates the table', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remediation_campaigns'")
      .get();
    expect(row).toBeDefined();
  });

  it.each(REQUIRED_COLUMNS)('column %s exists with notnull=%d pk=%d', (name, notnull, pk) => {
    const cols = db.prepare('PRAGMA table_info(remediation_campaigns)').all() as ColumnInfo[];
    const col = cols.find((c) => c.name === name);
    expect(col, `column ${name}`).toBeDefined();
    expect(col!.notnull).toBe(notnull);
    expect(col!.pk).toBe(pk);
  });

  it('creates the status / owner / due-date indexes', () => {
    const indexes = db.prepare('PRAGMA index_list(remediation_campaigns)').all() as IndexInfo[];
    const names = new Set(indexes.map((i) => i.name));
    expect(names.has('idx_remediation_campaigns_status')).toBe(true);
    expect(names.has('idx_remediation_campaigns_owner_status')).toBe(true);
    expect(names.has('idx_remediation_campaigns_due_date')).toBe(true);
  });

  it('is idempotent — running migrations twice is a no-op', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remediation_campaigns'")
      .get();
    expect(row).toBeDefined();
  });
});
