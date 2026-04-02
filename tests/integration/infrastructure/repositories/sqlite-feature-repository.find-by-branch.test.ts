/**
 * SQLiteFeatureRepository.findByBranch() Integration Tests
 *
 * Tests for duplicate adoption detection — ensures a branch is not already
 * tracked as a feature before adopting it.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';

describe('SQLiteFeatureRepository.findByBranch', () => {
  let db: Database.Database;
  let repository: SQLiteFeatureRepository;

  const createTestFeature = (overrides?: Partial<Feature>): Feature => ({
    id: 'feat-1',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/home/user/project',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SQLiteFeatureRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return feature when branch matches', async () => {
    await repository.create(createTestFeature({ branch: 'fix/login-bug' }));

    const found = await repository.findByBranch('fix/login-bug', '/home/user/project');

    expect(found).not.toBeNull();
    expect(found?.id).toBe('feat-1');
    expect(found?.branch).toBe('fix/login-bug');
    expect(found?.name).toBe('Test Feature');
  });

  it('should return null when branch does not match', async () => {
    await repository.create(createTestFeature({ branch: 'feat/test-feature' }));

    const found = await repository.findByBranch('feat/other-feature', '/home/user/project');

    expect(found).toBeNull();
  });

  it('should scope results to repositoryPath (different repos, same branch name)', async () => {
    await repository.create(
      createTestFeature({
        id: 'feat-1',
        branch: 'feat/shared-name',
        repositoryPath: '/repo/a',
      })
    );
    await repository.create(
      createTestFeature({
        id: 'feat-2',
        slug: 'shared-name-2',
        branch: 'feat/shared-name',
        repositoryPath: '/repo/b',
      })
    );

    const foundInA = await repository.findByBranch('feat/shared-name', '/repo/a');
    const foundInB = await repository.findByBranch('feat/shared-name', '/repo/b');
    const foundInC = await repository.findByBranch('feat/shared-name', '/repo/c');

    expect(foundInA).not.toBeNull();
    expect(foundInA?.id).toBe('feat-1');
    expect(foundInB).not.toBeNull();
    expect(foundInB?.id).toBe('feat-2');
    expect(foundInC).toBeNull();
  });

  it('should exclude soft-deleted features (deleted_at IS NOT NULL)', async () => {
    await repository.create(createTestFeature({ branch: 'feat/deleted-branch' }));
    await repository.softDelete('feat-1');

    const found = await repository.findByBranch('feat/deleted-branch', '/home/user/project');

    expect(found).toBeNull();
  });

  it('should normalize repository path with forward slashes', async () => {
    await repository.create(
      createTestFeature({
        branch: 'feat/normalize-test',
        repositoryPath: '/home/user/project',
      })
    );

    // Query with backslashes should still match
    const found = await repository.findByBranch('feat/normalize-test', '\\home\\user\\project');

    expect(found).not.toBeNull();
    expect(found?.id).toBe('feat-1');
  });

  it('should return correct Feature entity with all mapped fields', async () => {
    const feature = createTestFeature({
      branch: 'fix/auth-bug',
      lifecycle: SdlcLifecycle.Maintain,
      name: 'Auth Bug',
      slug: 'fix-auth-bug',
    });
    await repository.create(feature);

    const found = await repository.findByBranch('fix/auth-bug', '/home/user/project');

    expect(found).not.toBeNull();
    expect(found?.name).toBe('Auth Bug');
    expect(found?.slug).toBe('fix-auth-bug');
    expect(found?.lifecycle).toBe(SdlcLifecycle.Maintain);
    expect(found?.messages).toEqual([]);
    expect(found?.relatedArtifacts).toEqual([]);
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.updatedAt).toBeInstanceOf(Date);
  });
});
