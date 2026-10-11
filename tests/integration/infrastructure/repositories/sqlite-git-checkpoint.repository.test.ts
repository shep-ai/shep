/** Git checkpoints (spec 135): migration 170 and every field through the repository. */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/170-create-git-checkpoints.js';
import { SQLiteGitCheckpointRepository } from '@/infrastructure/repositories/sqlite-git-checkpoint.repository.js';
import { GitCheckpointKind, type GitCheckpoint } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-11T10:00:00Z');
const T2 = new Date('2026-10-11T10:05:00Z');

function checkpoint(overrides: Partial<GitCheckpoint>): GitCheckpoint {
  return {
    id: 'cp-1',
    featureId: 'feat-1',
    sequence: 0,
    kind: GitCheckpointKind.Baseline,
    node: 'baseline',
    ref: 'refs/shep/checkpoints/feat-1/0000-baseline',
    commitSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

/** Every optional field set and every number non-default. */
const STEP = checkpoint({
  id: 'cp-2',
  agentRunId: 'run-9',
  sequence: 3,
  kind: GitCheckpointKind.Step,
  node: 'implement',
  ref: 'refs/shep/checkpoints/feat-1/0003-implement',
  commitSha: 'c'.repeat(40),
  treeSha: 'd'.repeat(40),
  headSha: 'e'.repeat(40),
  filesChanged: 7,
  additions: 120,
  deletions: 33,
  createdAt: T2,
  updatedAt: T2,
});

describe('SQLiteGitCheckpointRepository', () => {
  let db: Database.Database;
  let repo: SQLiteGitCheckpointRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteGitCheckpointRepository(db);
  });
  afterEach(() => db.close());

  it('round-trips every field, including the optional ones', async () => {
    const baseline = checkpoint({});
    await repo.create(STEP);
    await repo.create(baseline);

    expect(await repo.listByFeatureId('feat-1')).toEqual([baseline, STEP]);
  });

  it('round-trips the PreRestore kind', async () => {
    const pre = checkpoint({
      id: 'cp-3',
      sequence: 4,
      kind: GitCheckpointKind.PreRestore,
      node: 'pre-restore',
    });
    await repo.create(pre);
    expect((await repo.listByFeatureId('feat-1'))[0].kind).toBe(GitCheckpointKind.PreRestore);
  });

  it('refuses a second checkpoint with the same sequence for one feature', async () => {
    await repo.create(checkpoint({}));
    await expect(repo.create(checkpoint({ id: 'cp-dup' }))).rejects.toThrow(/UNIQUE/);
    // …but the same sequence for another feature is fine
    await repo.create(checkpoint({ id: 'cp-other', featureId: 'feat-2' }));
  });

  it('deletes one feature and leaves the others', async () => {
    await repo.create(checkpoint({}));
    await repo.create(STEP);
    await repo.create(checkpoint({ id: 'cp-other', featureId: 'feat-2' }));

    expect(await repo.deleteByFeatureId('feat-1')).toBe(2);
    expect(await repo.listByFeatureId('feat-1')).toEqual([]);
    expect(await repo.listByFeatureId('feat-2')).toHaveLength(1);
  });

  it('migration 170 is idempotent', async () => {
    await up({ context: db } as never);
    await repo.create(checkpoint({}));
    expect(await repo.listByFeatureId('feat-1')).toHaveLength(1);
  });
});

describe('git checkpoint kind parsing', () => {
  it('reads an unknown stored kind as a step', async () => {
    const db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    const repo = new SQLiteGitCheckpointRepository(db);
    await repo.create(checkpoint({}));
    db.prepare("UPDATE git_checkpoints SET kind = 'FromTheFuture'").run();
    expect((await repo.listByFeatureId('feat-1'))[0].kind).toBe(GitCheckpointKind.Step);
    db.close();
  });
});
