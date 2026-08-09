/**
 * Migration 138 Integration Tests
 *
 * Verifies the dev_server_run_plans table (spec 103 agentic-dev-server)
 * is created with the correct schema and idempotent behavior.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

describe('Migration 138 — dev_server_run_plans table', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create dev_server_run_plans table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dev_server_run_plans'")
      .all() as { name: string }[];

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('dev_server_run_plans');
  });

  it('should have all required columns with correct types', () => {
    const columns = db.prepare('PRAGMA table_info(dev_server_run_plans)').all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }[];

    const columnMap = new Map(columns.map((c) => [c.name, c]));

    // Primary key
    expect(columnMap.get('repo_path')?.type).toBe('TEXT');
    expect(columnMap.get('repo_path')?.pk).toBe(1);

    // Required columns
    expect(columnMap.get('plan_source')?.type).toBe('TEXT');
    expect(columnMap.get('plan_source')?.notnull).toBe(1);

    expect(columnMap.get('command')?.type).toBe('TEXT');
    expect(columnMap.get('command')?.notnull).toBe(1);

    expect(columnMap.get('cwd')?.type).toBe('TEXT');
    expect(columnMap.get('cwd')?.notnull).toBe(1);

    expect(columnMap.get('setup_commands')?.type).toBe('TEXT');
    expect(columnMap.get('setup_commands')?.notnull).toBe(1);
    expect(columnMap.get('setup_commands')?.dflt_value).toBe("'[]'");

    expect(columnMap.get('config_hash')?.type).toBe('TEXT');
    expect(columnMap.get('config_hash')?.notnull).toBe(1);

    expect(columnMap.get('created_at')?.type).toBe('TEXT');
    expect(columnMap.get('created_at')?.notnull).toBe(1);

    expect(columnMap.get('updated_at')?.type).toBe('TEXT');
    expect(columnMap.get('updated_at')?.notnull).toBe(1);

    // Nullable columns
    expect(columnMap.get('package_manager')?.type).toBe('TEXT');
    expect(columnMap.get('package_manager')?.notnull).toBe(0);

    expect(columnMap.get('expected_port')?.type).toBe('INTEGER');
    expect(columnMap.get('expected_port')?.notnull).toBe(0);

    expect(columnMap.get('language')?.type).toBe('TEXT');
    expect(columnMap.get('language')?.notnull).toBe(0);

    expect(columnMap.get('framework')?.type).toBe('TEXT');
    expect(columnMap.get('framework')?.notnull).toBe(0);

    expect(columnMap.get('install_stamp_hash')?.type).toBe('TEXT');
    expect(columnMap.get('install_stamp_hash')?.notnull).toBe(0);
  });

  it('should be idempotent (running migrations twice does not throw)', async () => {
    const freshDb = createInMemoryDatabase();
    await runSQLiteMigrations(freshDb);
    await expect(runSQLiteMigrations(freshDb)).resolves.not.toThrow();
    freshDb.close();
  });

  it('should allow inserting and querying a run plan row', () => {
    db.prepare(
      `INSERT INTO dev_server_run_plans (
        repo_path, plan_source, command, cwd, package_manager,
        expected_port, language, framework, setup_commands,
        config_hash, install_stamp_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      '/home/user/my-app',
      'Agent',
      'pnpm dev',
      '/home/user/my-app/apps/web',
      'pnpm',
      3000,
      'TypeScript',
      'Next.js',
      '["corepack enable pnpm"]',
      'cfg-hash-1',
      'install-hash-1',
      '2026-07-04T10:00:00.000Z',
      '2026-07-04T10:00:00.000Z'
    );

    const row = db
      .prepare('SELECT * FROM dev_server_run_plans WHERE repo_path = ?')
      .get('/home/user/my-app') as Record<string, string | number>;

    expect(row.plan_source).toBe('Agent');
    expect(row.command).toBe('pnpm dev');
    expect(row.expected_port).toBe(3000);
    expect(row.setup_commands).toBe('["corepack enable pnpm"]');
  });

  it('should allow nullable fields to be NULL', () => {
    db.prepare(
      `INSERT INTO dev_server_run_plans (
        repo_path, plan_source, command, cwd, setup_commands,
        config_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      '/home/user/minimal',
      'Deterministic',
      'npm run dev',
      '/home/user/minimal',
      '[]',
      'cfg-hash-2',
      '2026-07-04T10:00:00.000Z',
      '2026-07-04T10:00:00.000Z'
    );

    const row = db
      .prepare('SELECT * FROM dev_server_run_plans WHERE repo_path = ?')
      .get('/home/user/minimal') as Record<string, string | number | null>;

    expect(row.package_manager).toBeNull();
    expect(row.expected_port).toBeNull();
    expect(row.language).toBeNull();
    expect(row.framework).toBeNull();
    expect(row.install_stamp_hash).toBeNull();
  });

  /**
   * Spec 108 adds RunPlanSource.Manual. Research verified plan_source is a bare
   * TEXT NOT NULL column with no CHECK constraint and no lookup-table FK, so the
   * new enum member needs NO migration. These two tests pin that: if anyone ever
   * adds a value constraint, the Manual member silently stops persisting.
   */
  it('should declare plan_source with no value constraint (no migration needed for new sources)', () => {
    const { sql } = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='dev_server_run_plans'")
      .get() as { sql: string };

    expect(sql).toContain('plan_source        TEXT NOT NULL');
    expect(sql.toUpperCase()).not.toContain('CHECK');
    expect(sql.toUpperCase()).not.toContain('REFERENCES');
  });

  it('should accept a Manual plan_source value on the unchanged schema', () => {
    db.prepare(
      `INSERT INTO dev_server_run_plans (
        repo_path, plan_source, command, cwd, setup_commands,
        config_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      '/home/user/manual',
      'Manual',
      'make dev',
      '/home/user/manual',
      '[]',
      'cfg-hash-3',
      '2026-08-09T10:00:00.000Z',
      '2026-08-09T10:00:00.000Z'
    );

    const row = db
      .prepare('SELECT plan_source FROM dev_server_run_plans WHERE repo_path = ?')
      .get('/home/user/manual') as { plan_source: string };

    expect(row.plan_source).toBe('Manual');
  });

  it('should enforce repo_path uniqueness (primary key)', () => {
    const insert = db.prepare(
      `INSERT INTO dev_server_run_plans (
        repo_path, plan_source, command, cwd, setup_commands,
        config_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run('/dup', 'Deterministic', 'a', '/dup', '[]', 'h', 't', 't');
    expect(() => insert.run('/dup', 'Agent', 'b', '/dup', '[]', 'h2', 't', 't')).toThrow();
  });
});
