/**
 * Migration 121 Integration Tests
 *
 * Verifies the security_events table is created with correct schema,
 * indexes, and idempotent behavior.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

describe('Migration 121 — security_events table', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create security_events table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_events'")
      .all() as { name: string }[];

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('security_events');
  });

  it('should have all required columns with correct types', () => {
    const columns = db.prepare('PRAGMA table_info(security_events)').all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];

    const columnMap = new Map(columns.map((c) => [c.name, c]));

    // Primary key
    expect(columnMap.get('id')?.type).toBe('TEXT');
    expect(columnMap.get('id')?.pk).toBe(1);

    // Required columns
    expect(columnMap.get('repository_path')?.type).toBe('TEXT');
    expect(columnMap.get('repository_path')?.notnull).toBe(1);

    expect(columnMap.get('severity')?.type).toBe('TEXT');
    expect(columnMap.get('severity')?.notnull).toBe(1);

    expect(columnMap.get('category')?.type).toBe('TEXT');
    expect(columnMap.get('category')?.notnull).toBe(1);

    expect(columnMap.get('disposition')?.type).toBe('TEXT');
    expect(columnMap.get('disposition')?.notnull).toBe(1);

    expect(columnMap.get('created_at')?.type).toBe('TEXT');
    expect(columnMap.get('created_at')?.notnull).toBe(1);

    // Nullable columns
    expect(columnMap.get('feature_id')?.type).toBe('TEXT');
    expect(columnMap.get('feature_id')?.notnull).toBe(0);

    expect(columnMap.get('actor')?.type).toBe('TEXT');
    expect(columnMap.get('actor')?.notnull).toBe(0);

    expect(columnMap.get('message')?.type).toBe('TEXT');
    expect(columnMap.get('message')?.notnull).toBe(0);

    expect(columnMap.get('remediation_summary')?.type).toBe('TEXT');
    expect(columnMap.get('remediation_summary')?.notnull).toBe(0);
  });

  it('should have index on repository_path and created_at', () => {
    const indexes = db.prepare('PRAGMA index_list(security_events)').all() as {
      name: string;
    }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_security_events_repo_created');
  });

  it('should have index on feature_id', () => {
    const indexes = db.prepare('PRAGMA index_list(security_events)').all() as {
      name: string;
    }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_security_events_feature');
  });

  it('should be idempotent (running migration twice does not throw)', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();
    freshDb.close();
  });

  it('should allow inserting and querying security events', () => {
    db.prepare(
      `INSERT INTO security_events (
        id, repository_path, feature_id, severity, category,
        disposition, actor, message, remediation_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'evt-001',
      '/path/to/repo',
      'feature-123',
      'High',
      'DependencyInstall',
      'Denied',
      'agent',
      'Blocked npm install of untrusted package',
      'Add package to allowlist or remove it',
      '2026-04-05T10:00:00Z'
    );

    const row = db.prepare('SELECT * FROM security_events WHERE id = ?').get('evt-001') as Record<
      string,
      string
    >;

    expect(row.repository_path).toBe('/path/to/repo');
    expect(row.feature_id).toBe('feature-123');
    expect(row.severity).toBe('High');
    expect(row.category).toBe('DependencyInstall');
    expect(row.disposition).toBe('Denied');
    expect(row.actor).toBe('agent');
  });

  it('should allow nullable fields to be NULL', () => {
    db.prepare(
      `INSERT INTO security_events (
        id, repository_path, severity, category, disposition, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('evt-002', '/path/to/repo', 'Low', 'CiWorkflowModify', 'Allowed', '2026-04-05T10:00:00Z');

    const row = db.prepare('SELECT * FROM security_events WHERE id = ?').get('evt-002') as Record<
      string,
      string | null
    >;

    expect(row.feature_id).toBeNull();
    expect(row.actor).toBeNull();
    expect(row.message).toBeNull();
    expect(row.remediation_summary).toBeNull();
  });

  it('should query by repository_path and created_at using the composite index', () => {
    // Insert two events for the same repo
    db.prepare(
      `INSERT INTO security_events (id, repository_path, severity, category, disposition, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('evt-a', '/repo-a', 'Low', 'DependencyInstall', 'Allowed', '2026-04-01T00:00:00Z');

    db.prepare(
      `INSERT INTO security_events (id, repository_path, severity, category, disposition, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('evt-b', '/repo-a', 'High', 'PublishRelease', 'Denied', '2026-04-05T00:00:00Z');

    db.prepare(
      `INSERT INTO security_events (id, repository_path, severity, category, disposition, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('evt-c', '/repo-b', 'Medium', 'CiWorkflowModify', 'Allowed', '2026-04-05T00:00:00Z');

    const repoAEvents = db
      .prepare('SELECT id FROM security_events WHERE repository_path = ? ORDER BY created_at')
      .all('/repo-a') as { id: string }[];

    expect(repoAEvents).toHaveLength(2);
    expect(repoAEvents[0].id).toBe('evt-a');
    expect(repoAEvents[1].id).toBe('evt-b');
  });
});
