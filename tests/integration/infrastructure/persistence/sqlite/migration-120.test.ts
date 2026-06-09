/**
 * Migration 120 Integration Tests
 *
 * Verifies the security settings columns are added to the settings table
 * with correct types, defaults, and idempotent behavior.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

describe('Migration 120 — security settings columns', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should add security_mode column to settings table', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain('security_mode');
  });

  it('should add security_last_evaluation_at column to settings table', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain('security_last_evaluation_at');
  });

  it('should add security_policy_source column to settings table', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain('security_policy_source');
  });

  it('should have TEXT type with NOT NULL and default Advisory for security_mode', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const col = columns.find((c) => c.name === 'security_mode');

    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(1);
    expect(col!.dflt_value).toBe("'Advisory'");
  });

  it('should have nullable TEXT type for security_last_evaluation_at', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const col = columns.find((c) => c.name === 'security_last_evaluation_at');

    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(0);
  });

  it('should have nullable TEXT type for security_policy_source', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const col = columns.find((c) => c.name === 'security_policy_source');

    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(0);
  });

  it('should be idempotent (running migration twice does not throw)', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();
    freshDb.close();
  });

  it('should default security_mode to Advisory for new rows', () => {
    db.prepare(
      `INSERT INTO settings (
        id, created_at, updated_at,
        model_analyze, model_requirements, model_plan, model_implement,
        env_default_editor, env_shell_preference,
        sys_auto_update, sys_log_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'test-sec',
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
      'm1',
      'm2',
      'm3',
      'm4',
      'vscode',
      'bash',
      1,
      'info'
    );

    const row = db.prepare('SELECT security_mode FROM settings WHERE id = ?').get('test-sec') as {
      security_mode: string;
    };
    expect(row.security_mode).toBe('Advisory');
  });

  it('should allow storing different security mode values', () => {
    db.prepare(
      `INSERT INTO settings (
        id, created_at, updated_at,
        model_analyze, model_requirements, model_plan, model_implement,
        env_default_editor, env_shell_preference,
        sys_auto_update, sys_log_level,
        security_mode, security_last_evaluation_at, security_policy_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'test-enforce',
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
      'm1',
      'm2',
      'm3',
      'm4',
      'vscode',
      'bash',
      1,
      'info',
      'Enforce',
      '2026-04-05T10:00:00Z',
      'shep.security.yaml'
    );

    const row = db
      .prepare(
        'SELECT security_mode, security_last_evaluation_at, security_policy_source FROM settings WHERE id = ?'
      )
      .get('test-enforce') as {
      security_mode: string;
      security_last_evaluation_at: string;
      security_policy_source: string;
    };
    expect(row.security_mode).toBe('Enforce');
    expect(row.security_last_evaluation_at).toBe('2026-04-05T10:00:00Z');
    expect(row.security_policy_source).toBe('shep.security.yaml');
  });
});
