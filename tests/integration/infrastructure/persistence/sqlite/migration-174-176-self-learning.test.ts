/**
 * Migrations 174–176 Integration Tests (spec 150 — self-learning harness)
 *
 * 174 adds the opt-in flag and the learning settings JSON column, 175 the
 * per-feature Explore override, 176 the learned-harness tables. Every one is
 * additive and idempotent.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up as up174 } from '@/infrastructure/persistence/sqlite/migrations/174-add-self-learning-settings.js';
import { up as up175 } from '@/infrastructure/persistence/sqlite/migrations/175-add-feature-explore-harness.js';
import { up as up176 } from '@/infrastructure/persistence/sqlite/migrations/176-create-learned-harness.js';

interface ColumnInfo {
  name: string;
  notnull: number;
  dflt_value: string | null;
}

function columns(db: Database.Database, table: string): Map<string, ColumnInfo> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  return new Map(rows.map((row) => [row.name, row]));
}

function indexNames(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`index_list(${table})`) as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

type MigrationArg = Parameters<typeof up174>[0];

describe('Migrations 174–176 — self-learning harness', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => db.close());

  it('174 adds feature_flag_self_learning as NOT NULL DEFAULT 0 and a nullable learning_config', () => {
    const settings = columns(db, 'settings');
    expect(settings.get('feature_flag_self_learning')?.notnull).toBe(1);
    expect(settings.get('feature_flag_self_learning')?.dflt_value).toBe('0');
    expect(settings.get('learning_config')?.notnull).toBe(0);
  });

  it('175 adds nullable explore_harness and explore_k to features', () => {
    const features = columns(db, 'features');
    expect(features.get('explore_harness')?.notnull).toBe(0);
    expect(features.get('explore_k')?.notnull).toBe(0);
  });

  it('176 creates every learned-harness table', () => {
    for (const table of [
      'learned_harness_versions',
      'learned_harness_edits',
      'learned_harness_lessons',
      'harness_refinement_runs',
      'learned_harness_outcomes',
    ]) {
      expect(columns(db, table).size, table).toBeGreaterThan(0);
    }
    expect(columns(db, 'learned_harness_versions').has('components')).toBe(true);
    expect(columns(db, 'learned_harness_outcomes').has('merged')).toBe(true);
  });

  it('176 indexes versions and lessons by scope and outcomes by version', () => {
    expect(indexNames(db, 'learned_harness_versions')).toContain(
      'idx_learned_harness_versions_repo_status'
    );
    expect(indexNames(db, 'learned_harness_versions')).toContain(
      'idx_learned_harness_versions_space_scope'
    );
    expect(indexNames(db, 'learned_harness_lessons')).toContain('idx_learned_harness_lessons_repo');
    expect(indexNames(db, 'learned_harness_outcomes')).toContain(
      'idx_learned_harness_outcomes_unique_version_feature'
    );
  });

  it('is idempotent', async () => {
    const arg = { context: db } as MigrationArg;
    await expect(up174(arg)).resolves.toBeUndefined();
    await expect(up175(arg)).resolves.toBeUndefined();
    await expect(up176(arg)).resolves.toBeUndefined();
  });
});
