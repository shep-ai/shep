/**
 * Migration 140 Integration Tests
 *
 * Verifies the adopted-session provenance columns (spec 105
 * import-codebases-adopt-sessions) are added to the features table and that
 * the migration is idempotent when re-run against an already-migrated schema.
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
  dflt_value: string | null;
}

function featureColumns(db: Database.Database): Map<string, ColumnInfo> {
  const columns = db.prepare('PRAGMA table_info(features)').all() as ColumnInfo[];
  return new Map(columns.map((c) => [c.name, c]));
}

describe('Migration 140 — adopted session provenance on features', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('adds source_agent_session_id as a nullable TEXT column', () => {
    const columns = featureColumns(db);

    expect(columns.has('source_agent_session_id')).toBe(true);
    expect(columns.get('source_agent_session_id')?.type).toBe('TEXT');
    // Nullable so existing feature rows remain valid without backfill.
    expect(columns.get('source_agent_session_id')?.notnull).toBe(0);
  });

  it('adds source_agent_type as a nullable TEXT column', () => {
    const columns = featureColumns(db);

    expect(columns.has('source_agent_type')).toBe(true);
    expect(columns.get('source_agent_type')?.type).toBe('TEXT');
    expect(columns.get('source_agent_type')?.notnull).toBe(0);
  });

  it('is idempotent when migrations run again on the same database', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const columns = featureColumns(db);
    expect(columns.has('source_agent_session_id')).toBe(true);
    expect(columns.has('source_agent_type')).toBe(true);
  });

  it('accepts a feature row carrying provenance values', () => {
    const columns = featureColumns(db);
    expect(columns.has('source_agent_session_id')).toBe(true);

    db.prepare(
      `INSERT INTO features (id, name, slug, description, repository_path, branch, lifecycle,
        user_query, build_mode, source_agent_session_id, source_agent_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'feat-140',
      'Adopted feature',
      'adopted-feature',
      'Derived from a Claude Code session',
      '/tmp/repo',
      'feature/adopted-feature',
      'Requirements',
      'adopt session',
      'application',
      '3f1a9c40-1d2b-4e77-9c11-2a5b6d8e0f34',
      'claude-code',
      Date.now(),
      Date.now()
    );

    const row = db
      .prepare('SELECT source_agent_session_id, source_agent_type FROM features WHERE id = ?')
      .get('feat-140') as { source_agent_session_id: string; source_agent_type: string };

    expect(row.source_agent_session_id).toBe('3f1a9c40-1d2b-4e77-9c11-2a5b6d8e0f34');
    expect(row.source_agent_type).toBe('claude-code');
  });

  it('leaves provenance null for features created without an adopted session', () => {
    db.prepare(
      `INSERT INTO features (id, name, slug, description, repository_path, branch, lifecycle,
        user_query, build_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'feat-140-plain',
      'Normal feature',
      'normal-feature',
      'Created through the normal flow',
      '/tmp/repo',
      'feature/normal-feature',
      'Requirements',
      'do a thing',
      'application',
      Date.now(),
      Date.now()
    );

    const row = db
      .prepare('SELECT source_agent_session_id, source_agent_type FROM features WHERE id = ?')
      .get('feat-140-plain') as {
      source_agent_session_id: string | null;
      source_agent_type: string | null;
    };

    expect(row.source_agent_session_id).toBeNull();
    expect(row.source_agent_type).toBeNull();
  });
});
