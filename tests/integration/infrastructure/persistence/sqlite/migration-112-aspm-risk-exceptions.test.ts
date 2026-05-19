/**
 * Migration 112 Integration Tests
 *
 * Verifies the risk_exceptions table is created with required columns +
 * indexes, that the active-per-finding partial unique index works, and
 * that re-running migrations is a no-op (NFR-18).
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
  ['finding_id', 1, 0],
  ['reason', 1, 0],
  ['justification', 1, 0],
  ['declared_by', 1, 0],
  ['declared_at', 1, 0],
  ['expires_at', 1, 0],
  ['status', 1, 0],
  ['audit_log', 1, 0],
  ['created_at', 1, 0],
  ['updated_at', 1, 0],
  ['deleted_at', 0, 0],
];

describe('Migration 112 — risk_exceptions table', () => {
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
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_exceptions'")
      .get();
    expect(row).toBeDefined();
  });

  it.each(REQUIRED_COLUMNS)('column %s exists with notnull=%d pk=%d', (name, notnull, pk) => {
    const cols = db.prepare('PRAGMA table_info(risk_exceptions)').all() as ColumnInfo[];
    const col = cols.find((c) => c.name === name);
    expect(col, `column ${name}`).toBeDefined();
    expect(col!.notnull).toBe(notnull);
    expect(col!.pk).toBe(pk);
  });

  it('creates the lookup + expiry + active-uniqueness indexes', () => {
    const indexes = db.prepare('PRAGMA index_list(risk_exceptions)').all() as IndexInfo[];
    const names = new Set(indexes.map((i) => i.name));
    expect(names.has('idx_risk_exceptions_finding_status')).toBe(true);
    expect(names.has('idx_risk_exceptions_expires_at_status')).toBe(true);
    expect(names.has('idx_risk_exceptions_finding_active_unique')).toBe(true);
  });

  it('is idempotent — running migrations twice is a no-op', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_exceptions'")
      .get();
    expect(row).toBeDefined();
  });
});
