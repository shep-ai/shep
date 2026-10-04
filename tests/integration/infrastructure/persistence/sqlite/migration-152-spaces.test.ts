/**
 * Migration 152 Integration Tests (spec 120)
 *
 * Creates the space tables, seeds the default space and stamps every existing
 * project memory row with it — without rewriting legacy Organization rows.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/152-create-spaces.js';
import { DEFAULT_SPACE_ID } from '@/domain/shared/space-resolution.js';

function columns(db: Database.Database, table: string): Map<string, { notnull: number }> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    notnull: number;
  }[];
  return new Map(rows.map((r) => [r.name, r]));
}

function insertMemory(db: Database.Database, id: string, scope: string): void {
  db.prepare(
    `INSERT INTO project_memory (id, repository_path, category, entry_key, content, scope, created_at, updated_at, space_id)
     VALUES (?, '/code/a', 'Convention', ?, 'text', ?, 1, 1, NULL)`
  ).run(id, `key-${id}`, scope);
}

describe('Migration 152 — spaces', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates the four space tables', () => {
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'spaces',
        'product_lines',
        'space_rules',
        'repository_space_assignments',
      ])
    );
  });

  it('seeds exactly one default space with the fixed id', () => {
    const rows = db.prepare('SELECT id, name, slug, is_default FROM spaces').all();
    expect(rows).toEqual([
      { id: DEFAULT_SPACE_ID, name: 'Default', slug: 'default', is_default: 1 },
    ]);
  });

  it('adds nullable space columns to project_memory', () => {
    const cols = columns(db, 'project_memory');
    expect(cols.get('space_id')?.notnull).toBe(0);
    expect(cols.get('product_line_id')?.notnull).toBe(0);
  });

  it('makes product line slugs unique within a space only', () => {
    const insert = db.prepare(
      'INSERT INTO product_lines (id, space_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)'
    );
    insert.run('l1', DEFAULT_SPACE_ID, 'Payments', 'payments');
    insert.run('l2', 'other-space', 'Payments', 'payments');
    expect(() => insert.run('l3', DEFAULT_SPACE_ID, 'Payments 2', 'payments')).toThrow(/UNIQUE/);
  });

  it('backfills existing memory into the default space without rewriting scope', async () => {
    insertMemory(db, 'm-project', 'Project');
    insertMemory(db, 'm-org', 'Organization');

    await up({ context: db, name: '152-create-spaces', path: '' } as never);

    const rows = db.prepare('SELECT id, scope, space_id FROM project_memory ORDER BY id').all() as {
      id: string;
      scope: string;
      space_id: string;
    }[];
    expect(rows).toEqual([
      { id: 'm-org', scope: 'Organization', space_id: DEFAULT_SPACE_ID },
      { id: 'm-project', scope: 'Project', space_id: DEFAULT_SPACE_ID },
    ]);
  });

  it('is idempotent', async () => {
    await up({ context: db, name: '152-create-spaces', path: '' } as never);
    const count = db.prepare('SELECT COUNT(*) AS n FROM spaces').get() as { n: number };
    expect(count.n).toBe(1);
  });
});
