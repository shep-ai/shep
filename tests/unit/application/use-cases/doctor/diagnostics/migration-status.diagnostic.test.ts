import 'reflect-metadata';
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';

import { MigrationStatusDiagnostic } from '@/application/use-cases/doctor/diagnostics/migration-status.diagnostic.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function makeDb(): Database.Database {
  return new Database(':memory:');
}

describe('MigrationStatusDiagnostic', () => {
  it('returns ok when umzug_migrations has at least one row', async () => {
    const db = makeDb();
    db.exec(`
      CREATE TABLE umzug_migrations (name TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      INSERT INTO umzug_migrations VALUES ('001-init', '2026-01-01');
      INSERT INTO umzug_migrations VALUES ('002-extend', '2026-01-02');
    `);
    const result = await new MigrationStatusDiagnostic(db).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('2');
  });

  it('returns fail when umzug_migrations table is missing', async () => {
    const db = makeDb();
    const result = await new MigrationStatusDiagnostic(db).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeDefined();
  });

  it('returns fail when umzug_migrations exists but is empty', async () => {
    const db = makeDb();
    db.exec(`CREATE TABLE umzug_migrations (name TEXT PRIMARY KEY, created_at TEXT NOT NULL);`);
    const result = await new MigrationStatusDiagnostic(db).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('empty');
  });
});
