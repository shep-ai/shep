/**
 * Migration 172 Integration Tests (spec 141)
 *
 * Adds the agent coordination feature-flag column, defaulting to off so no
 * agent judges overlapping features until a user opts in; re-running is a no-op.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/172-add-agent-coordination-feature-flag.js';

describe('Migration 172 — agent coordination feature flag', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => db.close());

  it('adds feature_flag_agent_coordination as NOT NULL DEFAULT 0', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const column = columns.find((c) => c.name === 'feature_flag_agent_coordination');
    expect(column).toBeDefined();
    expect(column?.notnull).toBe(1);
    expect(column?.dflt_value).toBe('0');
  });

  it('is idempotent', async () => {
    await expect(up({ context: db } as Parameters<typeof up>[0])).resolves.toBeUndefined();
  });
});
