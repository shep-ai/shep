/**
 * Migration 110 Integration Tests
 *
 * Verifies the risk_scores table is created with all required columns +
 * indexes, that current_risk_score_id remains nullable on security_findings,
 * and that running migrations twice is a no-op (NFR-18).
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
  ['total', 1, 0],
  ['cvss_contribution', 1, 0],
  ['epss_contribution', 1, 0],
  ['kev_contribution', 1, 0],
  ['exposure_contribution', 1, 0],
  ['criticality_contribution', 1, 0],
  ['data_classification_contribution', 1, 0],
  ['computed_at', 1, 0],
  ['inputs_hash', 1, 0],
  ['created_at', 1, 0],
  ['updated_at', 1, 0],
];

describe('Migration 110 — risk_scores table', () => {
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
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_scores'")
      .get();
    expect(row).toBeDefined();
  });

  it.each(REQUIRED_COLUMNS)('column %s exists with notnull=%d pk=%d', (name, notnull, pk) => {
    const cols = db.prepare('PRAGMA table_info(risk_scores)').all() as ColumnInfo[];
    const col = cols.find((c) => c.name === name);
    expect(col, `column ${name}`).toBeDefined();
    expect(col!.notnull).toBe(notnull);
    expect(col!.pk).toBe(pk);
  });

  it('creates ranking + history indexes', () => {
    const indexes = db.prepare('PRAGMA index_list(risk_scores)').all() as IndexInfo[];
    const names = new Set(indexes.map((i) => i.name));
    expect(names.has('idx_risk_scores_finding_id_computed_at')).toBe(true);
    expect(names.has('idx_risk_scores_total_desc')).toBe(true);
  });

  it('current_risk_score_id on security_findings is nullable', () => {
    const cols = db.prepare('PRAGMA table_info(security_findings)').all() as ColumnInfo[];
    const col = cols.find((c) => c.name === 'current_risk_score_id');
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(0);
  });

  it('is idempotent — running migrations twice is a no-op', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_scores'")
      .get();
    expect(row).toBeDefined();

    const indexes = db.prepare('PRAGMA index_list(risk_scores)').all() as IndexInfo[];
    expect(indexes.length).toBeGreaterThanOrEqual(2);
  });
});
