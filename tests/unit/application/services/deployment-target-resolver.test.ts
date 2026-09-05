import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeploymentTargetResolver,
  DeploymentTargetResolutionStatus,
} from '@/application/services/deployment-target-resolver.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import type { Application, Feature, Repository } from '@/domain/generated/output.js';
import { DeploymentTargetType } from '@/domain/generated/output.js';

const APP_ID = 'app-1';
const APP_PATH = '/workspaces/acme';
const FEATURE_ID = 'feature-1';
const FEATURE_WORKTREE = '/shep/worktrees/acme/feat-login';
const REPO_ID = 'repo-1';
const REPO_PATH = '/workspaces/acme';

function buildApplication(overrides: Partial<Application> = {}): Application {
  return { id: APP_ID, slug: 'acme', repositoryPath: APP_PATH, ...overrides } as Application;
}

function buildFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: FEATURE_ID,
    slug: 'login',
    branch: 'feat/login',
    repositoryPath: REPO_PATH,
    worktreePath: FEATURE_WORKTREE,
    ...overrides,
  } as Feature;
}

function buildRepository(overrides: Partial<Repository> = {}): Repository {
  return { id: REPO_ID, name: 'acme', path: REPO_PATH, ...overrides } as Repository;
}

function createDeps() {
  const applicationRepo = {
    findById: vi.fn().mockResolvedValue(buildApplication()),
    list: vi.fn().mockResolvedValue([buildApplication()]),
  } as unknown as IApplicationRepository;

  const featureRepo = {
    findById: vi.fn().mockResolvedValue(buildFeature()),
    list: vi.fn().mockResolvedValue([buildFeature()]),
  } as unknown as IFeatureRepository;

  const repositoryRepo = {
    findById: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([buildRepository()]),
  } as unknown as IRepositoryRepository;

  const fileSystem: IFileSystemService = {
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockReturnValue(true),
  };

  const worktreePaths: IWorktreePathProvider = {
    getWorktreePath: vi.fn().mockReturnValue('/derived/worktree'),
  };

  return { applicationRepo, featureRepo, repositoryRepo, fileSystem, worktreePaths };
}

describe('DeploymentTargetResolver', () => {
  let deps: ReturnType<typeof createDeps>;
  let resolver: DeploymentTargetResolver;

  beforeEach(() => {
    deps = createDeps();
    resolver = new DeploymentTargetResolver(
      deps.applicationRepo,
      deps.featureRepo,
      deps.repositoryRepo,
      deps.fileSystem,
      deps.worktreePaths
    );
  });

  describe('resolve', () => {
    it('resolves an application to its repository path', async () => {
      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Application,
        targetId: APP_ID,
      });

      expect(result).toEqual({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: {
          targetType: DeploymentTargetType.Application,
          targetId: APP_ID,
          repoPath: APP_PATH,
        },
      });
    });

    it('resolves a feature to its stored worktree path', async () => {
      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Feature,
        targetId: FEATURE_ID,
      });

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { repoPath: FEATURE_WORKTREE },
      });
    });

    it('derives a feature worktree path when the feature has none stored', async () => {
      vi.mocked(deps.featureRepo.findById).mockResolvedValue(
        buildFeature({ worktreePath: undefined })
      );

      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Feature,
        targetId: FEATURE_ID,
      });

      expect(deps.worktreePaths.getWorktreePath).toHaveBeenCalledWith(REPO_PATH, 'feat/login');
      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { repoPath: '/derived/worktree' },
      });
    });

    it('resolves a repository by id', async () => {
      vi.mocked(deps.repositoryRepo.findById).mockResolvedValue(buildRepository());

      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Repository,
        targetId: REPO_ID,
      });

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { repoPath: REPO_PATH },
      });
    });

    it('resolves a repository given an absolute path that is not registered', async () => {
      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Repository,
        targetId: '/elsewhere/project',
      });

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { repoPath: '/elsewhere/project' },
      });
    });

    it('accepts a Windows drive-letter path for a repository target', async () => {
      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Repository,
        targetId: 'C:\\workspaces\\acme',
      });

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { repoPath: 'C:/workspaces/acme' },
      });
    });

    it('returns a typed not-found result rather than throwing for an unknown id', async () => {
      vi.mocked(deps.applicationRepo.findById).mockResolvedValue(null);

      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Application,
        targetId: 'nope',
      });

      expect(result.status).toBe(DeploymentTargetResolutionStatus.NotFound);
    });

    it('returns a typed not-found result for an empty target id', async () => {
      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Application,
        targetId: '   ',
      });

      expect(result.status).toBe(DeploymentTargetResolutionStatus.NotFound);
      expect(deps.applicationRepo.findById).not.toHaveBeenCalled();
    });

    it('returns a typed path-missing result when the resolved path is not on disk', async () => {
      vi.mocked(deps.fileSystem.pathExists).mockReturnValue(false);

      const result = await resolver.resolve({
        targetType: DeploymentTargetType.Application,
        targetId: APP_ID,
      });

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.PathMissing,
        target: { repoPath: APP_PATH },
      });
    });
  });

  describe('resolveFromCwd', () => {
    it('identifies the target owning a directory beneath it', async () => {
      const result = await resolver.resolveFromCwd(`${FEATURE_WORKTREE}/packages/core`);

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { targetType: DeploymentTargetType.Feature, repoPath: FEATURE_WORKTREE },
      });
    });

    it('prefers the deepest owning target', async () => {
      vi.mocked(deps.applicationRepo.list).mockResolvedValue([
        buildApplication({ repositoryPath: `${REPO_PATH}/services/api` }),
      ]);
      vi.mocked(deps.featureRepo.list).mockResolvedValue([]);

      const result = await resolver.resolveFromCwd(`${REPO_PATH}/services/api/src`);

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: {
          targetType: DeploymentTargetType.Application,
          repoPath: `${REPO_PATH}/services/api`,
        },
      });
    });

    it('prefers the more specific target type when an application and a repository share a path', async () => {
      vi.mocked(deps.featureRepo.list).mockResolvedValue([]);

      const result = await resolver.resolveFromCwd(REPO_PATH);

      expect(result).toMatchObject({
        status: DeploymentTargetResolutionStatus.Resolved,
        target: { targetType: DeploymentTargetType.Application, repoPath: APP_PATH },
      });
    });

    it('reports ambiguity when two targets of the same type share the deepest path', async () => {
      vi.mocked(deps.featureRepo.list).mockResolvedValue([]);
      vi.mocked(deps.applicationRepo.list).mockResolvedValue([
        buildApplication({ id: 'app-a' }),
        buildApplication({ id: 'app-b' }),
      ]);

      const result = await resolver.resolveFromCwd(REPO_PATH);

      expect(result.status).toBe(DeploymentTargetResolutionStatus.Ambiguous);
      if (result.status === DeploymentTargetResolutionStatus.Ambiguous) {
        expect(result.candidates.map((c) => c.targetId)).toEqual(['app-a', 'app-b']);
      }
    });

    it('returns a typed unmatched result when nothing owns the directory', async () => {
      const result = await resolver.resolveFromCwd('/somewhere/else');

      expect(result.status).toBe(DeploymentTargetResolutionStatus.Unmatched);
    });

    it('does not treat a sibling directory sharing a prefix as owned', async () => {
      vi.mocked(deps.featureRepo.list).mockResolvedValue([]);
      vi.mocked(deps.applicationRepo.list).mockResolvedValue([]);
      vi.mocked(deps.repositoryRepo.list).mockResolvedValue([buildRepository({ path: '/repo' })]);

      const result = await resolver.resolveFromCwd('/repo-evil/src');

      expect(result.status).toBe(DeploymentTargetResolutionStatus.Unmatched);
    });

    it('returns a typed unmatched result for an empty cwd', async () => {
      const result = await resolver.resolveFromCwd('');

      expect(result.status).toBe(DeploymentTargetResolutionStatus.Unmatched);
    });
  });
});
