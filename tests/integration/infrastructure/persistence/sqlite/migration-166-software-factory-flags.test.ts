/**
 * Migration 166 Integration Tests (spec 133)
 *
 * Adds one feature-flag column per software-factory area, defaulting to on
 * so existing installs keep every area; re-running is a no-op.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/166-add-software-factory-feature-flags.js';

const COLUMNS = [
  'feature_flag_spaces',
  'feature_flag_trackers',
  'feature_flag_knowledge',
  'feature_flag_signals',
  'feature_flag_opportunities',
  'feature_flag_feedback',
  'feature_flag_discovery',
  'feature_flag_incidents',
  'feature_flag_outcomes',
  'feature_flag_docs_first',
  'feature_flag_autopilot',
  'feature_flag_factory',
];

describe('Migration 166 — software factory feature flags', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => db.close());

  it('adds every flag column as NOT NULL DEFAULT 1', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    for (const name of COLUMNS) {
      const column = columns.find((c) => c.name === name);
      expect(column, name).toBeDefined();
      expect(column?.notnull, name).toBe(1);
      expect(column?.dflt_value, name).toBe('1');
    }
  });

  it('is idempotent', async () => {
    await expect(up({ context: db } as Parameters<typeof up>[0])).resolves.toBeUndefined();
  });
});
