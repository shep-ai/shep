import 'reflect-metadata';
import type Database from 'better-sqlite3';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { Feature } from '@/domain/generated/output.js';
import { BuildMode, SdlcLifecycle } from '@/domain/generated/output.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';

export const OPTIMISTIC_CLICK_FEATURE_ID = 'e2e-optimistic-click-feature';
export const OPTIMISTIC_CLICK_FEATURE_NAME = 'E2E Clickable Feature';

const FIXTURE_DATE = new Date('2026-01-01T00:00:00.000Z');

function createOptimisticClickFeature(): Feature {
  return {
    id: OPTIMISTIC_CLICK_FEATURE_ID,
    name: OPTIMISTIC_CLICK_FEATURE_NAME,
    slug: 'e2e-clickable-feature',
    description: 'Deterministic fixture for optimistic node clickability tests',
    userQuery: 'Verify that persisted feature nodes remain clickable during optimistic creation',
    repositoryPath: '/test/repo',
    branch: 'test/e2e-clickable-feature',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: false,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: FIXTURE_DATE,
    updatedAt: FIXTURE_DATE,
  };
}

async function createFeatureRepository(db: Database.Database): Promise<IFeatureRepository> {
  await runSQLiteMigrations(db);
  return new SQLiteFeatureRepository(db);
}

export async function seedOptimisticClickFeature(db: Database.Database): Promise<void> {
  const repository = await createFeatureRepository(db);
  const fixture = createOptimisticClickFeature();
  const existing = await repository.findById(OPTIMISTIC_CLICK_FEATURE_ID);

  if (existing) {
    await repository.update(fixture);
    return;
  }

  // A previous interrupted run may have soft-deleted the fixture. Hard-delete
  // by deterministic ID before creating so repeated setup remains idempotent.
  await repository.delete(OPTIMISTIC_CLICK_FEATURE_ID);
  await repository.create(fixture);
}

export async function removeOptimisticClickFeature(db: Database.Database): Promise<void> {
  const repository = await createFeatureRepository(db);
  await repository.delete(OPTIMISTIC_CLICK_FEATURE_ID);
}
