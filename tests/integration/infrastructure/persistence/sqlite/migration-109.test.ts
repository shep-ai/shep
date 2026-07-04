/**
 * Migration 109 Integration Tests
 *
 * Verifies the specPath backfill for completed (Maintain) features.
 * After SDLC completion the worktree is removed, but spec files exist at
 * <repository_path>/specs/<specDirName>/ on the main branch.
 * Migration 109 repoints spec_path for all Maintain-lifecycle features.
 *
 * Test pattern: run all migrations to get the schema, reset tracking to 108
 * (making 109 "pending" again), insert pre-migration data, then re-run
 * migrations so 109 executes against the inserted rows.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  clearMigrationsAfter,
} from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';

function insertFeature(
  db: Database.Database,
  opts: { id: string; lifecycle: string; repositoryPath: string; specPath: string | null }
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO features
       (id, name, slug, description, user_query, repository_path, branch,
        lifecycle, messages, related_artifacts, spec_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, 'main', ?, '[]', '[]', ?, ?, ?)`
  ).run(
    opts.id,
    opts.id,
    opts.id,
    '',
    opts.repositoryPath,
    opts.lifecycle,
    opts.specPath,
    now,
    now
  );
}

describe('Migration 109 — spec_path backfill for completed features', () => {
  let db: Database.Database;

  beforeEach(async () => {
    // Run all migrations to establish the full schema, then reset migration
    // tracking so migration 109 is "pending". Tests insert data and re-run
    // migrations to trigger 109 against that data.
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    clearMigrationsAfter(db, '108');
  });

  afterEach(() => {
    db.close();
  });

  it('repoints spec_path from worktree location to repository root for Maintain features', async () => {
    insertFeature(db, {
      id: 'feat-maintain',
      lifecycle: 'Maintain',
      repositoryPath: '/repo/myproject',
      specPath: '/home/user/.shep/repos/abc123/wt/feat-my-feature/specs/001-my-feature',
    });

    await runSQLiteMigrations(db);

    const row = db.prepare('SELECT spec_path FROM features WHERE id = ?').get('feat-maintain') as {
      spec_path: string;
    };

    expect(row.spec_path).toBe('/repo/myproject/specs/001-my-feature');
  });

  it('does not modify spec_path for non-Maintain features', async () => {
    const worktreePath = '/home/user/.shep/repos/abc123/wt/feat-in-progress/specs/002-in-progress';
    insertFeature(db, {
      id: 'feat-in-progress',
      lifecycle: 'Implementation',
      repositoryPath: '/repo/myproject',
      specPath: worktreePath,
    });

    await runSQLiteMigrations(db);

    const row = db
      .prepare('SELECT spec_path FROM features WHERE id = ?')
      .get('feat-in-progress') as { spec_path: string };

    expect(row.spec_path).toBe(worktreePath);
  });

  it('does not modify spec_path when it is NULL', async () => {
    insertFeature(db, {
      id: 'feat-no-spec',
      lifecycle: 'Maintain',
      repositoryPath: '/repo/myproject',
      specPath: null,
    });

    await runSQLiteMigrations(db);

    const row = db.prepare('SELECT spec_path FROM features WHERE id = ?').get('feat-no-spec') as {
      spec_path: string | null;
    };

    expect(row.spec_path).toBeNull();
  });

  it('is idempotent when spec_path already points to repository root', async () => {
    const repoSpecPath = '/repo/myproject/specs/003-already-correct';
    insertFeature(db, {
      id: 'feat-already-correct',
      lifecycle: 'Maintain',
      repositoryPath: '/repo/myproject',
      specPath: repoSpecPath,
    });

    await runSQLiteMigrations(db);

    const row = db
      .prepare('SELECT spec_path FROM features WHERE id = ?')
      .get('feat-already-correct') as { spec_path: string };

    expect(row.spec_path).toBe(repoSpecPath);
  });

  it('handles trailing slashes in spec_path when computing specDirName', async () => {
    insertFeature(db, {
      id: 'feat-trailing-slash',
      lifecycle: 'Maintain',
      repositoryPath: '/repo/myproject',
      specPath: '/home/user/.shep/repos/abc123/wt/feat-slug/specs/004-trailing/',
    });

    await runSQLiteMigrations(db);

    const row = db
      .prepare('SELECT spec_path FROM features WHERE id = ?')
      .get('feat-trailing-slash') as { spec_path: string };

    expect(row.spec_path).toBe('/repo/myproject/specs/004-trailing');
  });

  it('is idempotent (running migration twice does not throw)', async () => {
    insertFeature(db, {
      id: 'feat-idempotent',
      lifecycle: 'Maintain',
      repositoryPath: '/repo/myproject',
      specPath: '/home/user/.shep/repos/abc123/wt/feat-idempotent/specs/005-idempotent',
    });

    await runSQLiteMigrations(db);
    clearMigrationsAfter(db, '108');
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();

    const row = db
      .prepare('SELECT spec_path FROM features WHERE id = ?')
      .get('feat-idempotent') as { spec_path: string };

    expect(row.spec_path).toBe('/repo/myproject/specs/005-idempotent');
  });
});
