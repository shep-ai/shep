/**
 * Migration 147 Integration Tests
 *
 * Verifies the nullable effort columns land on settings and agent_runs, that
 * existing rows read NULL (agent default), and that the migration is
 * idempotent.
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

function column(db: Database.Database, table: string, name: string): ColumnInfo | undefined {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  return columns.find((c) => c.name === name);
}

describe('Migration 147 — agent effort columns', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('adds a nullable model_effort column to settings with no default', () => {
    const col = column(db, 'settings', 'model_effort');
    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(0);
    expect(col!.dflt_value).toBeNull();
  });

  it('adds a nullable effort column to agent_runs with no default', () => {
    const col = column(db, 'agent_runs', 'effort');
    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(0);
    expect(col!.dflt_value).toBeNull();
  });

  it('is idempotent when re-run on a migrated database', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    expect(column(db, 'settings', 'model_effort')).toBeDefined();
    expect(column(db, 'agent_runs', 'effort')).toBeDefined();
  });

  it('re-applies cleanly when migration tracking is reset to before 147', async () => {
    clearMigrationsAfter(db, '146');
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    expect(column(db, 'settings', 'model_effort')).toBeDefined();
    expect(column(db, 'agent_runs', 'effort')).toBeDefined();
  });
});
