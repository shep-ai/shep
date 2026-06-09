/**
 * Migration 108 Integration Tests
 *
 * Verifies the security_findings table is created with the correct columns
 * and indexes, that the dedup unique index enforces the FR-8 key on live
 * rows only, and that running migrations twice is a no-op.
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
  ['workspace_id', 0, 0],
  ['application_id', 1, 0],
  ['service_id', 0, 0],
  ['api_asset_id', 0, 0],
  ['cloud_environment_id', 0, 0],
  ['finding_domain', 1, 0],
  ['rule_id', 1, 0],
  ['title', 1, 0],
  ['description', 1, 0],
  ['location_path', 0, 0],
  ['location_line', 0, 0],
  ['scanner_raw', 0, 0],
  ['scanner_raw_hash', 0, 0],
  ['raw_severity', 1, 0],
  ['canonical_severity', 1, 0],
  ['cve_id', 0, 0],
  ['cwe_id', 0, 0],
  ['owasp_asvs_control_id', 0, 0],
  ['owner_id', 0, 0],
  ['state', 1, 0],
  ['current_risk_score_id', 0, 0],
  ['work_item_id', 0, 0],
  ['source', 1, 0],
  ['discovered_at', 1, 0],
  ['last_seen_at', 1, 0],
  ['first_fixed_at', 0, 0],
  ['created_at', 1, 0],
  ['updated_at', 1, 0],
  ['deleted_at', 0, 0],
];

function baseInsert(db: Database.Database) {
  return db.prepare(
    `INSERT INTO security_findings (
       id, application_id, finding_domain, rule_id, title, description,
       location_path, location_line, raw_severity, canonical_severity,
       cve_id, source, state, discovered_at, last_seen_at, created_at, updated_at
     ) VALUES (
       @id, @application_id, @finding_domain, @rule_id, @title, @description,
       @location_path, @location_line, @raw_severity, @canonical_severity,
       @cve_id, @source, @state, @discovered_at, @last_seen_at, @created_at, @updated_at
     )`
  );
}

function defaultRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Date.now();
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    application_id: 'app-1',
    finding_domain: 'Code',
    rule_id: 'semgrep.sql-injection',
    title: 'SQL injection',
    description: 'Tainted input flows to a query.',
    location_path: 'src/foo.ts',
    location_line: 12,
    raw_severity: 'HIGH',
    canonical_severity: 'High',
    cve_id: null,
    source: 'sarif:semgrep',
    state: 'Open',
    discovered_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('Migration 108 — security_findings table', () => {
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
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_findings'")
      .get();
    expect(row).toBeDefined();
  });

  it.each(REQUIRED_COLUMNS)('column %s exists with notnull=%d pk=%d', (name, notnull, pk) => {
    const cols = db.prepare('PRAGMA table_info(security_findings)').all() as ColumnInfo[];
    const col = cols.find((c) => c.name === name);
    expect(col, `column ${name}`).toBeDefined();
    expect(col!.notnull).toBe(notnull);
    expect(col!.pk).toBe(pk);
  });

  it('creates all required indexes', () => {
    const indexes = db.prepare('PRAGMA index_list(security_findings)').all() as IndexInfo[];
    const names = new Set(indexes.map((i) => i.name));
    expect(names.has('idx_security_findings_app_severity_state')).toBe(true);
    expect(names.has('idx_security_findings_cve_id')).toBe(true);
    expect(names.has('idx_security_findings_owner_state')).toBe(true);
    expect(names.has('idx_security_findings_discovered_at')).toBe(true);
    expect(names.has('idx_security_findings_dedup_unique')).toBe(true);
  });

  it('enforces dedup uniqueness on live rows', () => {
    const insert = baseInsert(db);
    insert.run(defaultRow({ id: 'a' }));
    expect(() => insert.run(defaultRow({ id: 'b' }))).toThrow();
  });

  it('allows different rule_ids on the same location', () => {
    const insert = baseInsert(db);
    insert.run(defaultRow({ id: 'a', rule_id: 'rule-x' }));
    expect(() => insert.run(defaultRow({ id: 'b', rule_id: 'rule-y' }))).not.toThrow();
  });

  it('allows a row that was soft-deleted to be re-inserted (dedup index ignores deleted rows)', () => {
    const insert = baseInsert(db);
    insert.run(defaultRow({ id: 'a' }));
    db.prepare('UPDATE security_findings SET deleted_at = ? WHERE id = ?').run(Date.now(), 'a');
    expect(() => insert.run(defaultRow({ id: 'b' }))).not.toThrow();
  });

  it('treats null cve_id values as part of the dedup key (COALESCE)', () => {
    const insert = baseInsert(db);
    insert.run(defaultRow({ id: 'a', cve_id: null }));
    insert.run(defaultRow({ id: 'b', cve_id: 'CVE-2024-1' }));
    expect(() => insert.run(defaultRow({ id: 'c', cve_id: 'CVE-2024-1' }))).toThrow();
  });

  it('is idempotent — running migrations twice is a no-op', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_findings'")
      .get();
    expect(row).toBeDefined();

    const indexes = db.prepare('PRAGMA index_list(security_findings)').all() as IndexInfo[];
    expect(indexes.length).toBeGreaterThanOrEqual(5);
  });
});
