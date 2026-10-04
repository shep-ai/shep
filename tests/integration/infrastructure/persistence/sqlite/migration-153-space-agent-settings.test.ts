/**
 * Migration 153 Integration Tests (spec 121)
 *
 * Adds nullable agent-settings columns to spaces; re-running is a no-op and
 * existing spaces keep no settings.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/153-add-space-agent-settings.js';

const COLUMNS = [
  'claude_config_dir',
  'gh_config_dir',
  'git_author_name',
  'git_author_email',
  'aws_profile',
  'use_bedrock',
  'allowed_agent_types',
];

describe('Migration 153 — space agent settings', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => db.close());

  it('adds every agent settings column as nullable', () => {
    const columns = db.prepare('PRAGMA table_info(spaces)').all() as {
      name: string;
      notnull: number;
    }[];
    for (const name of COLUMNS) {
      const column = columns.find((c) => c.name === name);
      expect(column, name).toBeDefined();
      expect(column?.notnull, name).toBe(0);
    }
  });

  it('leaves the default space without settings', () => {
    const row = db.prepare('SELECT * FROM spaces WHERE is_default = 1').get() as Record<
      string,
      unknown
    >;
    for (const name of COLUMNS) expect(row[name], name).toBeNull();
  });

  it('is a no-op when run again', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });
});
