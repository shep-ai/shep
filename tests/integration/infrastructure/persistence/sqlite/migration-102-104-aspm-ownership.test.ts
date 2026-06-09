/**
 * Migrations 102-104 Integration Tests
 *
 * Verifies the owners, teams, and business_units tables are created with the
 * correct columns and indexes, and that running migrations twice is a no-op.
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

describe('Migrations 102-104 — ASPM ownership tables', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('102 — owners table', () => {
    it('should create the table', () => {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='owners'")
        .get();
      expect(row).toBeDefined();
    });

    it.each([
      ['id', 0, 1],
      ['name', 1, 0],
      ['handle', 0, 0],
      ['team_id', 0, 0],
      ['notes', 0, 0],
      ['created_at', 1, 0],
      ['updated_at', 1, 0],
      ['deleted_at', 0, 0],
    ] as const)('column %s should exist with notnull=%d, pk=%d', (name, notnull, pk) => {
      const cols = db.prepare('PRAGMA table_info(owners)').all() as ColumnInfo[];
      const col = cols.find((c) => c.name === name);
      expect(col).toBeDefined();
      expect(col!.notnull).toBe(notnull);
      expect(col!.pk).toBe(pk);
    });

    it('should create idx_owners_team_id and idx_owners_handle_unique', () => {
      const indexes = db.prepare('PRAGMA index_list(owners)').all() as IndexInfo[];
      const names = new Set(indexes.map((i) => i.name));
      expect(names.has('idx_owners_team_id')).toBe(true);
      expect(names.has('idx_owners_handle_unique')).toBe(true);
    });

    it('should enforce unique handle (case-insensitive)', () => {
      const now = Date.now();
      const insert = db.prepare(
        'INSERT INTO owners (id, name, handle, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      insert.run('o1', 'Alice', 'alice@example.com', now, now);
      expect(() => insert.run('o2', 'Alice2', 'ALICE@example.com', now, now)).toThrow();
    });

    it('should allow multiple owners with null handle', () => {
      const now = Date.now();
      const insert = db.prepare(
        'INSERT INTO owners (id, name, handle, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)'
      );
      expect(() => {
        insert.run('o-null-1', 'A', now, now);
        insert.run('o-null-2', 'B', now, now);
      }).not.toThrow();
    });
  });

  describe('103 — teams table', () => {
    it('should create the table', () => {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'")
        .get();
      expect(row).toBeDefined();
    });

    it.each([
      ['id', 0, 1],
      ['name', 1, 0],
      ['slug', 0, 0],
      ['business_unit_id', 0, 0],
      ['created_at', 1, 0],
      ['updated_at', 1, 0],
      ['deleted_at', 0, 0],
    ] as const)('column %s should exist with notnull=%d, pk=%d', (name, notnull, pk) => {
      const cols = db.prepare('PRAGMA table_info(teams)').all() as ColumnInfo[];
      const col = cols.find((c) => c.name === name);
      expect(col).toBeDefined();
      expect(col!.notnull).toBe(notnull);
      expect(col!.pk).toBe(pk);
    });

    it('should create idx_teams_slug_unique and idx_teams_business_unit_id', () => {
      const indexes = db.prepare('PRAGMA index_list(teams)').all() as IndexInfo[];
      const names = new Set(indexes.map((i) => i.name));
      expect(names.has('idx_teams_slug_unique')).toBe(true);
      expect(names.has('idx_teams_business_unit_id')).toBe(true);
    });

    it('should enforce unique slug (case-insensitive)', () => {
      const now = Date.now();
      const insert = db.prepare(
        'INSERT INTO teams (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      insert.run('t1', 'Platform', 'platform', now, now);
      expect(() => insert.run('t2', 'Other', 'PLATFORM', now, now)).toThrow();
    });
  });

  describe('104 — business_units table', () => {
    it('should create the table', () => {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_units'")
        .get();
      expect(row).toBeDefined();
    });

    it.each([
      ['id', 0, 1],
      ['name', 1, 0],
      ['slug', 0, 0],
      ['created_at', 1, 0],
      ['updated_at', 1, 0],
      ['deleted_at', 0, 0],
    ] as const)('column %s should exist with notnull=%d, pk=%d', (name, notnull, pk) => {
      const cols = db.prepare('PRAGMA table_info(business_units)').all() as ColumnInfo[];
      const col = cols.find((c) => c.name === name);
      expect(col).toBeDefined();
      expect(col!.notnull).toBe(notnull);
      expect(col!.pk).toBe(pk);
    });

    it('should enforce unique slug (case-insensitive)', () => {
      const now = Date.now();
      const insert = db.prepare(
        'INSERT INTO business_units (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      insert.run('b1', 'Platform', 'platform', now, now);
      expect(() => insert.run('b2', 'Other', 'PLATFORM', now, now)).toThrow();
    });
  });

  it('should be idempotent — running migrations twice is a no-op', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    for (const table of ['owners', 'teams', 'business_units']) {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      expect(row).toBeDefined();
    }
  });
});
