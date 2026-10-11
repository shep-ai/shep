/**
 * Migration 171 Integration Tests (spec 140)
 *
 * Adds the SDLC board feature-flag column, defaulting to off so the board is
 * hidden until a user turns it on; re-running is a no-op.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/171-add-sdlc-board-feature-flag.js';

describe('Migration 171 — SDLC board feature flag', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => db.close());

  it('adds feature_flag_sdlc_board as NOT NULL DEFAULT 0', () => {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const column = columns.find((c) => c.name === 'feature_flag_sdlc_board');
    expect(column).toBeDefined();
    expect(column?.notnull).toBe(1);
    expect(column?.dflt_value).toBe('0');
  });

  it('is idempotent', async () => {
    await expect(up({ context: db } as Parameters<typeof up>[0])).resolves.toBeUndefined();
  });
});
