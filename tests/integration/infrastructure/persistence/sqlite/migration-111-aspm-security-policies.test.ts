/**
 * Migration 111 Integration Tests
 *
 * Verifies the security_policies table is created with required columns +
 * indexes, that exactly one default policy is seeded on first run, and that
 * running migrations twice is a no-op (NFR-18) — the seed must NOT duplicate.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import {
  DEFAULT_SECURITY_POLICY_NAME,
  DEFAULT_SLA_CRITICAL_DAYS,
  DEFAULT_SLA_HIGH_DAYS,
  DEFAULT_SLA_MEDIUM_DAYS,
  DEFAULT_SLA_LOW_DAYS,
  DEFAULT_INGEST_MAX_BYTES,
} from '@/infrastructure/persistence/sqlite/migrations/111-create-security-policies.js';

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
  ['is_active', 1, 0],
  ['sla_critical_days', 1, 0],
  ['sla_high_days', 1, 0],
  ['sla_medium_days', 1, 0],
  ['sla_low_days', 1, 0],
  ['ingestion_max_bytes', 1, 0],
  ['created_at', 1, 0],
  ['updated_at', 1, 0],
  ['deleted_at', 0, 0],
];

describe('Migration 111 — security_policies table', () => {
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
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_policies'")
      .get();
    expect(row).toBeDefined();
  });

  it.each(REQUIRED_COLUMNS)('column %s exists with notnull=%d pk=%d', (name, notnull, pk) => {
    const cols = db.prepare('PRAGMA table_info(security_policies)').all() as ColumnInfo[];
    const col = cols.find((c) => c.name === name);
    expect(col, `column ${name}`).toBeDefined();
    expect(col!.notnull).toBe(notnull);
    expect(col!.pk).toBe(pk);
  });

  it('creates the unique active + unique name indexes', () => {
    const indexes = db.prepare('PRAGMA index_list(security_policies)').all() as IndexInfo[];
    const names = new Set(indexes.map((i) => i.name));
    expect(names.has('idx_security_policies_active_unique')).toBe(true);
    expect(names.has('idx_security_policies_name_unique')).toBe(true);
  });

  it('seeds exactly one default policy with documented defaults', () => {
    const rows = db
      .prepare('SELECT * FROM security_policies WHERE LOWER(name) = LOWER(?)')
      .all(DEFAULT_SECURITY_POLICY_NAME) as {
      id: string;
      name: string;
      is_active: number;
      sla_critical_days: number;
      sla_high_days: number;
      sla_medium_days: number;
      sla_low_days: number;
      ingestion_max_bytes: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(1);
    expect(rows[0].sla_critical_days).toBe(DEFAULT_SLA_CRITICAL_DAYS);
    expect(rows[0].sla_high_days).toBe(DEFAULT_SLA_HIGH_DAYS);
    expect(rows[0].sla_medium_days).toBe(DEFAULT_SLA_MEDIUM_DAYS);
    expect(rows[0].sla_low_days).toBe(DEFAULT_SLA_LOW_DAYS);
    expect(rows[0].ingestion_max_bytes).toBe(DEFAULT_INGEST_MAX_BYTES);
  });

  it('is idempotent — running migrations twice does not duplicate the default policy', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const count = db
      .prepare('SELECT COUNT(*) AS c FROM security_policies WHERE deleted_at IS NULL')
      .get() as { c: number };
    expect(count.c).toBe(1);

    const active = db
      .prepare(
        'SELECT COUNT(*) AS c FROM security_policies WHERE is_active = 1 AND deleted_at IS NULL'
      )
      .get() as { c: number };
    expect(active.c).toBe(1);
  });

  it('rejects a second active policy via the partial unique index', () => {
    const insert = db.prepare(
      `INSERT INTO security_policies (
         id, name, is_active,
         sla_critical_days, sla_high_days, sla_medium_days, sla_low_days,
         ingestion_max_bytes, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 1, 7, 30, 90, 180, ?, ?, ?, NULL)`
    );
    expect(() =>
      insert.run('second-id', 'Stricter', DEFAULT_INGEST_MAX_BYTES, Date.now(), Date.now())
    ).toThrow();
  });
});
