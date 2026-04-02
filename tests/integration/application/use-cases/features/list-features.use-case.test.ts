/**
 * ListFeaturesUseCase Integration Tests
 *
 * Uses real SQLite repository + migrations (no mocks) to verify
 * what the use case actually returns from persistence.
 */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import {
  getSQLiteConnection,
  closeSQLiteConnection,
} from '@/infrastructure/persistence/sqlite/connection.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';

describe('ListFeaturesUseCase (integration)', () => {
  const testRepoPath = `/integration-tests/list-features/${randomUUID()}`;
  const testRepoPathOther = `${testRepoPath}/other`;

  let db: Database.Database;
  let useCase: ListFeaturesUseCase;
  let repository: SQLiteFeatureRepository;
  let createdFeatureIds: string[] = [];

  const createId = () => `it-list-feature-${randomUUID()}`;

  const createTestFeature = (overrides?: Partial<Feature>): Feature => ({
    id: createId(),
    name: 'Test Feature',
    slug: `test-feature-${randomUUID()}`,
    description: 'Feature persisted in real SQLite',
    userQuery: 'test user query',
    repositoryPath: testRepoPath,
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
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  });

  beforeAll(async () => {
    db = await getSQLiteConnection();
    await runSQLiteMigrations(db);
    repository = new SQLiteFeatureRepository(db);
    useCase = new ListFeaturesUseCase(repository);
  });

  beforeEach(() => {
    createdFeatureIds = [];
  });

  afterEach(async () => {
    const deleteStmt = db.prepare('DELETE FROM features WHERE id = ?');
    for (const id of createdFeatureIds) {
      deleteStmt.run(id);
    }
  });

  afterAll(() => {
    closeSQLiteConnection();
  });

  it('returns persisted features from SQLite', async () => {
    const featureOne = createTestFeature({ name: 'Feature One' });
    const featureTwo = createTestFeature({
      name: 'Feature Two',
      lifecycle: SdlcLifecycle.Implementation,
    });

    createdFeatureIds.push(featureOne.id, featureTwo.id);

    await repository.create(featureOne);
    await repository.create(featureTwo);

    const result = await useCase.execute({ repositoryPath: testRepoPath });

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Feature One', 'Feature Two'])
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        repositoryPath: testRepoPath,
        lifecycle: expect.any(String),
      })
    );
  });

  it('returns filtered features by repositoryPath', async () => {
    const targetFeature = createTestFeature({ repositoryPath: testRepoPath });
    const otherFeature = createTestFeature({
      repositoryPath: testRepoPathOther,
      slug: `other-feature-${randomUUID()}`,
    });

    createdFeatureIds.push(targetFeature.id, otherFeature.id);

    await repository.create(targetFeature);
    await repository.create(otherFeature);

    const result = await useCase.execute({ repositoryPath: testRepoPath });

    expect(result).toHaveLength(1);
    expect(result[0].repositoryPath).toBe(testRepoPath);
  });
});
