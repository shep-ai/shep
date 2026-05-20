import 'reflect-metadata';

import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import { BuildMode, SdlcLifecycle } from '@/domain/generated/output.js';
import type { Feature, Repository } from '@/domain/generated/output.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import { SQLiteRepositoryRepository } from '@/infrastructure/repositories/sqlite-repository.repository.js';
import { openShepDb } from './collaboration-flag';

export const OPTIMISTIC_NODE_REPOSITORY_PATH = '/tmp/shep-e2e-optimistic-node-repo';
export const OPTIMISTIC_NODE_ACTIVE_FEATURE_NAME = 'E2E Active Click Target';
const REPOSITORY_ID = 'e2e-optimistic-node-repo';

const FEATURE_FIXTURES = [
  {
    id: 'e2e-optimistic-node-existing',
    name: 'E2E Existing Click Target',
    slug: 'e2e-existing-click-target',
    lifecycle: SdlcLifecycle.Maintain,
  },
  {
    id: 'e2e-optimistic-node-active',
    name: OPTIMISTIC_NODE_ACTIVE_FEATURE_NAME,
    slug: 'e2e-active-click-target',
    lifecycle: SdlcLifecycle.Implementation,
  },
] as const;

function buildRepository(now: Date): Repository {
  return {
    id: REPOSITORY_ID,
    name: 'E2E Optimistic Node Repo',
    path: OPTIMISTIC_NODE_REPOSITORY_PATH,
    createdAt: now,
    updatedAt: now,
  };
}

function buildFeature(fixture: (typeof FEATURE_FIXTURES)[number], now: Date): Feature {
  return {
    id: fixture.id,
    name: fixture.name,
    userQuery: fixture.name,
    slug: fixture.slug,
    description: `${fixture.name} seeded by optimistic-node-clickability e2e fixtures.`,
    repositoryPath: OPTIMISTIC_NODE_REPOSITORY_PATH,
    branch: `feature/${fixture.slug}`,
    lifecycle: fixture.lifecycle,
    messages: [],
    relatedArtifacts: [],
    repositoryId: REPOSITORY_ID,
    buildMode: BuildMode.Spec,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: false,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: {
      allowPrd: true,
      allowPlan: true,
      allowMerge: true,
    },
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function deleteExistingFixtureFeatures(features: IFeatureRepository): Promise<void> {
  const existing = await features.list({ includeArchived: true, includeDeleted: true });
  for (const feature of existing) {
    if (
      feature.repositoryPath === OPTIMISTIC_NODE_REPOSITORY_PATH ||
      feature.id.startsWith('e2e-optimistic-node-')
    ) {
      await features.delete(feature.id);
    }
  }
}

/**
 * Seeds deterministic feature nodes for optimistic clickability e2e tests.
 *
 * Writes through the repository ports so the fixtures stay aligned with the
 * domain mapper instead of duplicating the current SQLite column list.
 */
export async function seedOptimisticNodeFixtures(): Promise<() => Promise<void>> {
  const db = openShepDb();
  const features: IFeatureRepository = new SQLiteFeatureRepository(db);
  const repositories: IRepositoryRepository = new SQLiteRepositoryRepository(db);
  const now = new Date();

  await deleteExistingFixtureFeatures(features);

  const existingRepo = await repositories.findByPathIncludingDeleted(
    OPTIMISTIC_NODE_REPOSITORY_PATH
  );
  if (existingRepo?.deletedAt) {
    await repositories.restore(existingRepo.id);
  } else if (!existingRepo) {
    await repositories.create(buildRepository(now));
  }

  for (const fixture of FEATURE_FIXTURES) {
    await features.create(buildFeature(fixture, now));
  }

  return async () => {
    await deleteExistingFixtureFeatures(features);
    const repo = await repositories.findByPathIncludingDeleted(OPTIMISTIC_NODE_REPOSITORY_PATH);
    if (repo) {
      await repositories.remove(repo.id);
    }
    db.close();
  };
}
