import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ListScanTargetsUseCase } from '@/application/use-cases/aspm/scan/list-scan-targets';
import {
  ApplicationStatus,
  SdlcLifecycle,
  BuildMode,
  type Application,
  type Feature,
  type Repository,
} from '@/domain/generated/output';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface';
import type { ListApplicationsUseCase } from '@/application/use-cases/applications/list-applications.use-case';

function makeApp(overrides: Partial<Application> = {}): Application {
  const now = new Date('2026-05-20T15:00:00Z');
  return {
    id: randomUUID(),
    name: 'app',
    slug: 'app',
    description: '',
    repositoryPath: '/repos/r1',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: true,
    bedrockEnabled: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  const now = new Date('2026-05-20T15:00:00Z');
  return {
    id: randomUUID(),
    name: 'feat',
    userQuery: '',
    slug: 'feat',
    description: '',
    repositoryPath: '/repos/r1',
    branch: 'feat/x',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: {} as Feature['approvalGates'],
    worktreePath: '/wt/feat-x',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRepo(path: string, name: string): Repository {
  const now = new Date('2026-05-20T15:00:00Z');
  return { id: randomUUID(), name, path, createdAt: now, updatedAt: now };
}

function makeUseCase(opts: {
  applications: Application[];
  repositories: Repository[];
  features: Feature[];
}): ListScanTargetsUseCase {
  const listApplications = {
    execute: async () =>
      opts.applications.map((a) => ({ ...a, effectiveStatus: 'ready' as const })),
  } as unknown as ListApplicationsUseCase;
  const repoRepo: IRepositoryRepository = {
    list: async () => opts.repositories,
  } as unknown as IRepositoryRepository;
  const featureRepo: IFeatureRepository = {
    list: async () => opts.features,
  } as unknown as IFeatureRepository;
  return new ListScanTargetsUseCase(listApplications, repoRepo, featureRepo);
}

describe('ListScanTargetsUseCase', () => {
  it('groups applications under their owning repository', async () => {
    const repoA = makeRepo('/repos/r1', 'repo-a');
    const repoB = makeRepo('/repos/r2', 'repo-b');
    const app1 = makeApp({ name: 'web', repositoryPath: '/repos/r1' });
    const app2 = makeApp({ name: 'api', repositoryPath: '/repos/r1' });
    const app3 = makeApp({ name: 'worker', repositoryPath: '/repos/r2' });

    const usecase = makeUseCase({
      applications: [app1, app2, app3],
      repositories: [repoA, repoB],
      features: [],
    });

    const result = await usecase.execute();

    expect(result.repositories).toHaveLength(2);
    const repoARow = result.repositories.find((r): boolean => r.repositoryId === repoA.id);
    expect(repoARow?.applications.map((a): string => a.applicationName).sort()).toEqual([
      'api',
      'web',
    ]);
    const repoBRow = result.repositories.find((r): boolean => r.repositoryId === repoB.id);
    expect(repoBRow?.applications.map((a): string => a.applicationName)).toEqual(['worker']);
  });

  it('attaches features (worktrees) to their parent application by applicationId', async () => {
    const repo = makeRepo('/repos/r1', 'repo-a');
    const app = makeApp({ name: 'web', repositoryPath: '/repos/r1' });
    const featLinked = makeFeature({
      name: 'add-auth',
      branch: 'feat/auth',
      worktreePath: '/wt/auth',
      applicationId: app.id,
      repositoryPath: '/repos/r1',
    });
    const featUnlinked = makeFeature({
      name: 'unrelated',
      branch: 'feat/other',
      worktreePath: '/wt/other',
      repositoryPath: '/repos/r1',
    });

    const usecase = makeUseCase({
      applications: [app],
      repositories: [repo],
      features: [featLinked, featUnlinked],
    });

    const result = await usecase.execute();

    expect(result.repositories).toHaveLength(1);
    const appRow = result.repositories[0]!.applications[0]!;
    expect(appRow.features.map((f) => f.featureName)).toEqual(['add-auth']);
    expect(appRow.features[0]!.worktreePath).toBe('/wt/auth');
    expect(appRow.features[0]!.featureBranch).toBe('feat/auth');
  });

  it('skips features without a worktreePath since they cannot be scanned', async () => {
    const repo = makeRepo('/repos/r1', 'repo-a');
    const app = makeApp({ name: 'web', repositoryPath: '/repos/r1' });
    const featNoWorktree = makeFeature({
      name: 'no-wt',
      worktreePath: undefined,
      applicationId: app.id,
    });

    const usecase = makeUseCase({
      applications: [app],
      repositories: [repo],
      features: [featNoWorktree],
    });

    const result = await usecase.execute();
    expect(result.repositories[0]!.applications[0]!.features).toEqual([]);
  });

  it('places apps whose repositoryPath has no matching Repository under a synthetic group', async () => {
    const app = makeApp({ name: 'orphan', repositoryPath: '/repos/missing' });
    const usecase = makeUseCase({
      applications: [app],
      repositories: [],
      features: [],
    });

    const result = await usecase.execute();
    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]!.repositoryId).toBeUndefined();
    expect(result.repositories[0]!.repositoryPath).toBe('/repos/missing');
    expect(result.repositories[0]!.applications).toHaveLength(1);
  });
});
